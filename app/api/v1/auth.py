"""Authentication API: login, refresh, logout, password reset, SSO, profile."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import get_db
from app.models.users import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    ProfileUpdate,
    RefreshRequest,
    TokenResponse,
)
from app.schemas.users import UserRead
from app.services import auth_service
from app.services.auth_service import get_google_authorization_url

router = APIRouter()


@router.post("/auth/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """Login with email and password; returns access and refresh tokens."""
    try:
        result = await auth_service.login_email_password(db, body.email, body.password)
        return LoginResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Exchange refresh token for new access token."""
    try:
        result = await auth_service.refresh_tokens(db, body.refresh_token)
        return TokenResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/auth/logout")
async def logout(
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Revoke the given refresh token."""
    await auth_service.logout(db, body.refresh_token)
    return {"message": "Logged out"}


@router.get("/auth/sso/google")
async def sso_google_authorize() -> dict:
    """Redirect URL for Google OAuth2 login. Frontend can redirect user here."""
    url = get_google_authorization_url()
    if not url:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google SSO not configured",
        )
    return {"authorization_url": url}


@router.get("/auth/sso/callback")
async def sso_callback(
    code: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """OAuth2 callback: exchange code for tokens; returns JWTs (for frontend to store)."""
    try:
        result = await auth_service.exchange_google_code_and_login(db, code)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/auth/password-reset/request")
async def password_reset_request(
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Request password reset; sends email if user exists (no-op sender in default setup)."""
    await auth_service.request_password_reset(db, body.email)
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/auth/password-reset/confirm")
async def password_reset_confirm(
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set new password using reset token."""
    try:
        await auth_service.reset_password(db, body.token, body.new_password)
        return {"message": "Password updated"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/auth/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    """Return current authenticated user (profile)."""
    return UserRead.model_validate(user)


@router.patch("/auth/me", response_model=UserRead)
async def update_me(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserRead:
    """Update current user profile (full_name, phone, preferred_language)."""
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.phone is not None:
        user.phone = body.phone
    if body.preferred_language is not None:
        user.preferred_language = body.preferred_language
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)
