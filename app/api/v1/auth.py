"""Authentication API: login, refresh, logout, password reset, SSO, profile."""

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_permissions, get_user_role_codes
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.employee_profile import EmployeeProfile
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

LOGIN_RATE_LIMIT = "5/minute"
REFRESH_RATE_LIMIT = "20/minute"
LOGOUT_RATE_LIMIT = "20/minute"
SSO_RATE_LIMIT = "10/minute"
PASSWORD_RESET_REQUEST_RATE_LIMIT = "100/hour" if settings.is_development else "5/hour"
PASSWORD_RESET_CONFIRM_RATE_LIMIT = "30/hour" if settings.is_development else "10/hour"
AVATAR_UPLOAD_RATE_LIMIT = "20/minute"


@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit(LOGIN_RATE_LIMIT)
async def login(
    request: Request,
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
@limiter.limit(REFRESH_RATE_LIMIT)
async def refresh(
    request: Request,
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
@limiter.limit(LOGOUT_RATE_LIMIT)
async def logout(
    request: Request,
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Revoke the given refresh token."""
    await auth_service.logout(db, body.refresh_token)
    return {"message": "Logged out"}


@router.get("/auth/sso/google")
@limiter.limit(SSO_RATE_LIMIT)
async def sso_google_authorize(request: Request) -> dict:
    """Redirect URL for Google OAuth2 login. Frontend can redirect user here."""
    url = get_google_authorization_url()
    if not url:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google SSO not configured",
        )
    return {"authorization_url": url}


@router.get("/auth/sso/callback")
@limiter.limit(SSO_RATE_LIMIT)
async def sso_callback(
    request: Request,
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
@limiter.limit(PASSWORD_RESET_REQUEST_RATE_LIMIT)
async def password_reset_request(
    request: Request,
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Request password reset; emails a reset link if the account exists."""
    await auth_service.request_password_reset(db, body.email)
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/auth/password-reset/confirm")
@limiter.limit(PASSWORD_RESET_CONFIRM_RATE_LIMIT)
async def password_reset_confirm(
    request: Request,
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
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    """Return current authenticated user (profile)."""
    res = await db.execute(select(EmployeeProfile.id).where(EmployeeProfile.user_id == user.id))
    employee_profile_id = res.scalar_one_or_none()
    payload = UserRead.model_validate(user).model_dump()
    payload["employee_profile_id"] = employee_profile_id
    return UserRead.model_validate(payload)


class PermissionRead(BaseModel):
    """A single effective permission for the current user."""

    resource: str
    action: str


class UserRolesResponse(BaseModel):
    """Assigned role codes for the current user (strings match ``roles.code``)."""

    codes: list[str]


@router.get("/auth/me/roles", response_model=UserRolesResponse)
async def me_roles(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserRolesResponse:
    """Return distinct role codes for UI gates (e.g. org-wide notification admin)."""
    codes = await get_user_role_codes(db, user.id)
    return UserRolesResponse(codes=sorted(codes))


@router.get("/auth/me/permissions", response_model=list[PermissionRead])
async def me_permissions(
    permissions: set[tuple[str, str]] = Depends(get_current_user_permissions),
) -> list[PermissionRead]:
    """Return the current user's effective permissions (roles ∪ overrides).

    Mirrors `get_current_user_permissions` from `app/api/deps.py`: each item is
    a `(resource, action)` tuple already resolved with role membership and
    per-user allow/deny overrides. Used by the frontend `<Can />` guard and
    RBAC-driven sidebar trimming (`WEB_FRONTEND_PLAN.md` §4.3, §4.4).
    """
    return [PermissionRead(resource=r, action=a) for r, a in sorted(permissions)]


@router.post("/auth/me/avatar", response_model=UserRead)
@limiter.limit(AVATAR_UPLOAD_RATE_LIMIT)
async def upload_my_avatar(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserRead:
    """Upload a profile photo (JPEG, PNG, or WebP)."""
    raw = await file.read(settings.AVATAR_MAX_BYTES + 1)
    if len(raw) > settings.AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Avatar file too large",
        )
    try:
        user = await auth_service.save_user_avatar_image(db, user, raw)
    except ValueError as exc:
        code = str(exc)
        if code == "avatar_too_large":
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Avatar file too large",
            )
        if code == "avatar_invalid_image":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Avatar must be JPEG, PNG, or WebP",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)
    return UserRead.model_validate(user)


@router.patch("/auth/me", response_model=UserRead)
async def update_me(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserRead:
    """Update current user profile (email, contact, language, avatar URL, optional password)."""
    try:
        user = await auth_service.update_own_profile(db, user, body)
    except ValueError as exc:
        code = str(exc)
        if code == "email_already_in_use":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already in use",
            )
        if code == "email_required":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is required",
            )
        if code == "invalid_current_password":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )
        if code == "password_change_unavailable":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password change is not available for this account",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)
    return UserRead.model_validate(user)
