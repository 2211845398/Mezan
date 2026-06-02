"""Authentication service: email/password, JWT, refresh, password reset, SSO."""

import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from secrets import token_urlsafe
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.refresh_token import RefreshToken
from app.models.users import User
from app.services import bootstrap_admin_protection, email_service
from app.services.password_reset_email import build_password_reset_email, normalize_reset_locale
from app.schemas.auth import ProfileUpdate
from app.utils.image_format import detect_raster_image_extension
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)

ACTIVE_STATUS = "active"
logger = logging.getLogger(__name__)


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


async def get_user_by_email_insensitive(db: AsyncSession, email: str) -> User | None:
    """Load user by email (case-insensitive, trimmed)."""
    normalized = bootstrap_admin_protection.normalize_email(email)
    result = await db.execute(select(User).where(func.lower(User.email) == normalized))
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
    If user exists, create a short-lived reset token and email a reset link.
    Does not reveal whether email exists.
    """
    from app.models.password_reset_token import PasswordResetToken

    user = await get_user_by_email_insensitive(db, email)
    if not user:
        if settings.is_development:
            logger.warning(
                "Password reset not sent: no user matches email (check spelling / case)."
            )
        return
    if bootstrap_admin_protection.is_bootstrap_protected_user(user):
        if settings.is_production:
            return
        logger.warning(
            "Password reset for bootstrap admin (%s) allowed in development only.",
            user.email,
        )
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

    reset_url = settings.build_password_reset_url(token_str)
    locale = normalize_reset_locale(user.preferred_language)
    subject, body_text, body_html = build_password_reset_email(
        locale=locale,
        reset_url=reset_url,
        company_name=settings.COMPANY_DISPLAY_NAME,
    )
    try:
        await email_service.send_email(
            to=str(user.email),
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )
    except Exception:
        logger.exception("Password reset email delivery failed for user_id=%s", user.id)
    else:
        logger.info("Password reset email queued to=%s subject=%r", user.email, subject)
    if settings.is_development:
        logger.warning("Password reset link (dev, also check Mailpit :8025): %s", reset_url)


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


async def update_own_profile(db: AsyncSession, user: User, body: ProfileUpdate) -> User:
    """Apply profile fields and optional password change. Raises ValueError with stable codes."""
    data = body.model_dump(exclude_unset=True)

    if "email" in data:
        if body.email is None:
            raise ValueError("email_required")
        new_email = str(body.email)
        if new_email != user.email:
            dup = await db.execute(
                select(User.id).where(User.email == new_email).where(User.id != user.id)
            )
            if dup.scalar_one_or_none() is not None:
                raise ValueError("email_already_in_use")
            user.email = new_email

    for field, col in (("first_name", "first_name"), ("father_name", "father_name"), ("family_name", "family_name")):
        if field in data:
            v = getattr(body, field)
            setattr(user, col, v.strip() if isinstance(v, str) and v.strip() else None)

    if "phone" in data:
        user.phone = body.phone

    if "city" in data:
        user.city = body.city

    if "preferred_language" in data:
        user.preferred_language = body.preferred_language

    if "avatar_url" in data:
        v = body.avatar_url
        user.avatar_url = v.strip() if v and v.strip() else None

    wants_pw_change = "new_password" in data and body.new_password is not None
    if wants_pw_change:
        if not user.password_hash:
            raise ValueError("password_change_unavailable")
        assert body.current_password is not None
        if not verify_password(body.current_password, user.password_hash):
            raise ValueError("invalid_current_password")
        user.password_hash = hash_password(body.new_password)

    await db.commit()
    await db.refresh(user)
    return user


async def save_user_avatar_image(db: AsyncSession, user: User, file_body: bytes) -> User:
    """Persist avatar bytes to disk and set ``user.avatar_url`` to a stable URL path."""
    if len(file_body) > settings.AVATAR_MAX_BYTES:
        raise ValueError("avatar_too_large")
    ext = detect_raster_image_extension(file_body[:64])
    if ext is None:
        raise ValueError("avatar_invalid_image")

    root = Path(settings.AVATAR_UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    for old in root.glob(f"{user.id}.*"):
        try:
            old.unlink()
        except OSError:
            pass

    dest = root / f"{user.id}.{ext}"
    dest.write_bytes(file_body)
    user.avatar_url = f"/api/v1/static/avatars/{user.id}.{ext}"
    await db.commit()
    await db.refresh(user)
    return user


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
            first_name=str(name).strip() if name else None,
            father_name=None,
            family_name=None,
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
