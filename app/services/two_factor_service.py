"""Two-factor authentication: OTP issue and verification."""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.two_factor_otp import TwoFactorChallenge, TwoFactorOtp
from app.models.users import User
from app.services import email_service
from app.services.two_factor_email import build_two_factor_otp_email, normalize_otp_locale
from app.utils.security import hash_token, verify_password

logger = logging.getLogger(__name__)

OTP_EXPIRE_MINUTES = 10
CHALLENGE_EXPIRE_MINUTES = 15


def _generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def _invalidate_pending_otps(db: AsyncSession, user_id: int) -> None:
    result = await db.execute(
        select(TwoFactorOtp).where(
            TwoFactorOtp.user_id == user_id,
            TwoFactorOtp.consumed_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    for row in result.scalars().all():
        row.consumed_at = now


async def create_login_challenge(db: AsyncSession, user: User) -> tuple[str, str]:
    """Create OTP + challenge token; email OTP. Returns (challenge_token, otp_plain) for dev logs."""
    await _invalidate_pending_otps(db, user.id)

    otp_plain = _generate_otp_code()
    otp = TwoFactorOtp(
        user_id=user.id,
        code_hash=hash_token(otp_plain),
        expires_at=datetime.now(UTC) + timedelta(minutes=OTP_EXPIRE_MINUTES),
    )
    db.add(otp)

    challenge_token = secrets.token_urlsafe(32)
    challenge = TwoFactorChallenge(
        user_id=user.id,
        token_hash=hash_token(challenge_token),
        expires_at=datetime.now(UTC) + timedelta(minutes=CHALLENGE_EXPIRE_MINUTES),
    )
    db.add(challenge)
    await db.flush()

    locale = normalize_otp_locale(user.preferred_language)
    subject, body_text, body_html = build_two_factor_otp_email(
        locale=locale,
        code=otp_plain,
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
        logger.exception("2FA OTP email delivery failed for user_id=%s", user.id)
    else:
        logger.info("2FA OTP email sent to=%s", user.email)
    if settings.is_development:
        logger.warning("2FA OTP (dev): %s challenge=%s", otp_plain, challenge_token)

    return challenge_token, otp_plain


async def verify_login_challenge(
    db: AsyncSession,
    *,
    challenge_token: str,
    code: str,
) -> User | None:
    """Validate challenge + OTP; mark consumed. Returns user or None."""
    challenge_hash = hash_token(challenge_token)
    result = await db.execute(
        select(TwoFactorChallenge).where(
            TwoFactorChallenge.token_hash == challenge_hash,
            TwoFactorChallenge.consumed_at.is_(None),
            TwoFactorChallenge.expires_at > datetime.now(UTC),
        )
    )
    challenge = result.scalar_one_or_none()
    if challenge is None:
        return None

    otp_result = await db.execute(
        select(TwoFactorOtp)
        .where(
            TwoFactorOtp.user_id == challenge.user_id,
            TwoFactorOtp.consumed_at.is_(None),
            TwoFactorOtp.expires_at > datetime.now(UTC),
        )
        .order_by(TwoFactorOtp.created_at.desc())
        .limit(1)
    )
    otp_row = otp_result.scalar_one_or_none()
    if otp_row is None:
        return None

    code_hash = hash_token(code.strip())
    if otp_row.code_hash != code_hash:
        return None

    now = datetime.now(UTC)
    otp_row.consumed_at = now
    challenge.consumed_at = now

    user_result = await db.execute(select(User).where(User.id == challenge.user_id))
    return user_result.scalar_one_or_none()


async def set_two_factor_enabled(
    db: AsyncSession,
    user: User,
    *,
    enabled: bool,
    current_password: str | None = None,
) -> User:
    if enabled:
        if (
            not current_password
            or not user.password_hash
            or not verify_password(current_password, user.password_hash)
        ):
            raise ValueError("invalid_current_password")
    user.two_factor_enabled = enabled
    await db.commit()
    await db.refresh(user)
    return user
