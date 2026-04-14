"""Authentication service: email/password, JWT, refresh, password reset, SSO."""

from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.refresh_token import RefreshToken
from app.models.users import User
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)

ACTIVE_STATUS = "active"


def _is_session_idle_expired(last_used_at: datetime | None) -> bool:
    if settings.SESSION_IDLE_TIMEOUT_MINUTES <= 0:
        return False
    if last_used_at is None:
        return True
    idle_seconds = (datetime.now(UTC) - last_used_at).total_seconds()
    return idle_seconds > settings.SESSION_IDLE_TIMEOUT_MINUTES * 60


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Load user by email."""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def login_email_password(
    db: AsyncSession,
    email: str,
    password: str,
) -> dict[str, Any]:
    """
    Authenticate by email/password; return access and refresh tokens.
    Raises ValueError if credentials invalid or user not active.
    """
    user = await get_user_by_email(db, email)
    if not user:
        raise ValueError("Invalid email or password")
    if user.status != ACTIVE_STATUS:
        raise ValueError("Account is not active")
    if not user.password_hash:
        raise ValueError("Invalid email or password")
    if not verify_password(password, user.password_hash):
        raise ValueError("Invalid email or password")

    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id)
    refresh_token_str = create_refresh_token(user.id)
    token_hash = hash_token(refresh_token_str)

    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        last_used_at=datetime.now(UTC),
    )
    db.add(refresh_record)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user_id": user.id,
        "email": user.email,
    }


async def refresh_tokens(db: AsyncSession, refresh_token_str: str) -> dict[str, Any]:
    """
    Validate refresh token and return new access token (and optionally new refresh token).
    Raises ValueError if token invalid or revoked.
    """
    payload = decode_token(refresh_token_str)
    if not payload or payload.get("type") != "refresh":
        raise ValueError("Invalid refresh token")

    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Invalid refresh token")
    user_id = int(user_id)

    token_hash = hash_token(refresh_token_str)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > datetime.now(UTC),
        )
    )
    refresh_record = result.scalar_one_or_none()
    if not refresh_record or refresh_record.user_id != user_id:
        raise ValueError("Invalid refresh token")
    if _is_session_idle_expired(refresh_record.last_used_at):
        refresh_record.revoked = True
        await db.commit()
        raise ValueError("Session expired due to inactivity")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.status != ACTIVE_STATUS:
        raise ValueError("Account is not active")

    refresh_record.last_used_at = datetime.now(UTC)
    await db.commit()

    access_token = create_access_token(user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


async def logout(db: AsyncSession, refresh_token_str: str) -> None:
    """Revoke the given refresh token."""
    token_hash = hash_token(refresh_token_str)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    record = result.scalar_one_or_none()
    if record:
        record.revoked = True
        await db.commit()


async def request_password_reset(db: AsyncSession, email: str) -> None:
    """
    If user exists, create a short-lived reset token and trigger email (no-op sender for now).
    Does not reveal whether email exists.
    """
    from app.models.password_reset_token import PasswordResetToken

    user = await get_user_by_email(db, email)
    if not user:
        return
    stale = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used.is_(False),
        )
    )
    for token in stale.scalars().all():
        token.used = True
    token_str = token_urlsafe(32)
    token_hash = hash_token(token_str)
    expires_at = datetime.now(UTC) + timedelta(minutes=60)
    reset = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(reset)
    await db.commit()
    # TODO: send email with link containing token_str via pluggable EmailSender
    # For now no-op (e.g. in dev log the link)


async def reset_password(db: AsyncSession, token_str: str, new_password: str) -> None:
    """Validate reset token and set new password. Raises ValueError if token invalid."""
    from app.models.password_reset_token import PasswordResetToken

    token_hash = hash_token(token_str)
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used.is_(False),
            PasswordResetToken.expires_at > datetime.now(UTC),
        )
    )
    reset_record = result.scalar_one_or_none()
    if not reset_record:
        raise ValueError("Invalid or expired reset token")

    user_result = await db.execute(select(User).where(User.id == reset_record.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise ValueError("Invalid or expired reset token")

    user.password_hash = hash_password(new_password)
    reset_record.used = True
    await db.commit()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    """Load user by id."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


def get_google_authorization_url(state: str | None = None) -> str:
    """Return Google OAuth2 authorization URL. Returns empty string if SSO not configured."""
    if not settings.GOOGLE_CLIENT_ID:
        return ""
    base = "https://accounts.google.com/o/oauth2/v2/auth"
    redirect_uri = f"{settings.OAUTH_CALLBACK_BASE_URL.rstrip('/')}/api/v1/auth/sso/callback"
    scope = "openid email profile"
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
    }
    if state:
        params["state"] = state
    from urllib.parse import urlencode

    return f"{base}?{urlencode(params)}"


async def exchange_google_code_and_login(
    db: AsyncSession,
    code: str,
) -> dict[str, Any]:
    """
    Exchange Google OAuth2 code for tokens, get user info, find or create user, return JWTs.
    Raises ValueError if SSO not configured or code invalid.
    """
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise ValueError("SSO not configured")

    import httpx
    import jwt as pyjwt

    redirect_uri = f"{settings.OAUTH_CALLBACK_BASE_URL.rstrip('/')}/api/v1/auth/sso/callback"
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if token_resp.status_code != 200:
        raise ValueError("Invalid authorization code")

    data = token_resp.json()
    id_token = data.get("id_token")
    if not id_token:
        raise ValueError("No id_token in response")

    # Decode without verification for payload only; Google's id_token is signed
    payload = pyjwt.decode(
        id_token,
        options={"verify_signature": False},
    )
    email = payload.get("email")
    name = payload.get("name") or payload.get("email", "").split("@")[0]
    if not email:
        raise ValueError("Email not in id_token")

    user = await get_user_by_email(db, email)
    if not user:
        user = User(
            email=email,
            full_name=name,
            password_hash=None,
            status=ACTIVE_STATUS,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif user.status != ACTIVE_STATUS:
        raise ValueError("Account is not active")

    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id)
    refresh_token_str = create_refresh_token(user.id)
    token_hash = hash_token(refresh_token_str)
    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        last_used_at=datetime.now(UTC),
    )
    db.add(refresh_record)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user_id": user.id,
        "email": user.email,
    }
