"""Password reset: OTP challenge, email, verify, confirm, bootstrap guard."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.password_reset_challenge import PasswordResetChallenge
from app.models.users import User
from app.services import auth_service, email_service
from app.services.password_reset_email import build_password_reset_otp_email, normalize_reset_locale
from app.utils.security import hash_password, verify_password

OTP_PATTERN = re.compile(r"\b\d{6}\b")


async def _create_user(
    db_session,
    *,
    email: str | None = None,
    preferred_language: str | None = "ar",
) -> User:
    addr = email or f"reset-{uuid.uuid4().hex[:8]}@example.com"
    user = User(
        email=addr,
        first_name="Reset",
        father_name=None,
        family_name="User",
        password_hash=hash_password("oldpassword1"),
        status="active",
        preferred_language=preferred_language,
        branch_id=None,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _request_and_capture(db_session, monkeypatch, email: str) -> tuple[str, str]:
    captured: dict[str, str] = {}

    async def _capture_send(**kwargs):
        match = OTP_PATTERN.search(kwargs["body_text"])
        assert match is not None
        captured["otp"] = match.group(0)

    monkeypatch.setattr(email_service, "send_email", _capture_send)
    challenge_token = await auth_service.request_password_reset(db_session, email)
    assert "otp" in captured
    return challenge_token, captured["otp"]


@pytest.mark.asyncio
async def test_request_password_reset_sends_email_and_stores_challenge(
    db_session, monkeypatch
) -> None:
    user = await _create_user(db_session)
    send_mock = AsyncMock()
    monkeypatch.setattr(email_service, "send_email", send_mock)

    challenge_token = await auth_service.request_password_reset(db_session, user.email)

    send_mock.assert_awaited_once()
    kwargs = send_mock.await_args.kwargs
    assert kwargs["to"] == user.email
    assert OTP_PATTERN.search(kwargs["body_text"])
    assert challenge_token

    result = await db_session.execute(
        select(PasswordResetChallenge).where(
            PasswordResetChallenge.user_id == user.id,
            PasswordResetChallenge.used.is_(False),
        )
    )
    row = result.scalar_one()
    assert row.otp_expires_at > datetime.now(UTC)
    assert row.reset_token_hash is None


@pytest.mark.asyncio
async def test_reset_password_updates_hash_and_marks_challenge_used(
    db_session, monkeypatch
) -> None:
    user = await _create_user(db_session)
    challenge_token, otp = await _request_and_capture(db_session, monkeypatch, user.email)

    reset_token = await auth_service.verify_reset_otp(db_session, challenge_token, otp)
    await auth_service.reset_password(db_session, reset_token, "newpassword2")

    await db_session.refresh(user)
    assert verify_password("newpassword2", user.password_hash)
    assert not verify_password("oldpassword1", user.password_hash)

    result = await db_session.execute(
        select(PasswordResetChallenge).where(PasswordResetChallenge.user_id == user.id)
    )
    row = result.scalar_one()
    assert row.used is True


@pytest.mark.asyncio
async def test_reset_password_rejects_invalid_token(db_session) -> None:
    with pytest.raises(ValueError, match="Invalid or expired"):
        await auth_service.reset_password(db_session, "not-a-real-token", "newpassword2")


@pytest.mark.asyncio
async def test_reset_password_rejects_expired_token(db_session, monkeypatch) -> None:
    user = await _create_user(db_session)
    challenge_token, otp = await _request_and_capture(db_session, monkeypatch, user.email)
    reset_token = await auth_service.verify_reset_otp(db_session, challenge_token, otp)

    result = await db_session.execute(
        select(PasswordResetChallenge).where(PasswordResetChallenge.user_id == user.id)
    )
    row = result.scalar_one()
    row.reset_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    with pytest.raises(ValueError, match="Invalid or expired"):
        await auth_service.reset_password(db_session, reset_token, "newpassword2")


@pytest.mark.asyncio
async def test_reset_password_rejects_reused_token(db_session, monkeypatch) -> None:
    user = await _create_user(db_session)
    challenge_token, otp = await _request_and_capture(db_session, monkeypatch, user.email)
    reset_token = await auth_service.verify_reset_otp(db_session, challenge_token, otp)

    await auth_service.reset_password(db_session, reset_token, "newpassword2")
    with pytest.raises(ValueError, match="Invalid or expired"):
        await auth_service.reset_password(db_session, reset_token, "anotherpass3")


@pytest.mark.asyncio
async def test_verify_reset_otp_rejects_invalid_code(db_session, monkeypatch) -> None:
    user = await _create_user(db_session)
    challenge_token, _ = await _request_and_capture(db_session, monkeypatch, user.email)

    with pytest.raises(ValueError, match="Invalid or expired"):
        await auth_service.verify_reset_otp(db_session, challenge_token, "000000")


@pytest.mark.asyncio
async def test_bootstrap_admin_self_service_reset_silent_no_challenge(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    email = f"bootstrap-{uuid.uuid4().hex[:6]}@example.com"
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_EMAIL", email)
    user = await _create_user(db_session, email=email)
    send_mock = AsyncMock()
    monkeypatch.setattr(email_service, "send_email", send_mock)

    await auth_service.request_password_reset(db_session, user.email)

    send_mock.assert_not_awaited()
    result = await db_session.execute(
        select(PasswordResetChallenge).where(PasswordResetChallenge.user_id == user.id)
    )
    assert result.scalar_one_or_none() is None


def test_normalize_reset_locale_defaults_to_ar() -> None:
    assert normalize_reset_locale(None) == "ar"
    assert normalize_reset_locale("ar") == "ar"


def test_normalize_reset_locale_english() -> None:
    assert normalize_reset_locale("en") == "en"
    assert normalize_reset_locale("en-US") == "en"


def test_build_password_reset_otp_email_ar_and_en() -> None:
    sub_ar, text_ar, html_ar = build_password_reset_otp_email(
        locale="ar", code="123456", company_name="Mezan"
    )
    sub_en, text_en, html_en = build_password_reset_otp_email(
        locale="en", code="123456", company_name="Mezan"
    )
    assert "إعادة" in sub_ar
    assert "123456" in text_ar
    assert "123456" in html_ar
    assert "Reset" in sub_en or "reset" in sub_en.lower()
    assert "123456" in text_en
    assert "123456" in html_en
