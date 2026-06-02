"""Password reset: token issuance, email, confirm, bootstrap guard."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.password_reset_token import PasswordResetToken
from app.models.users import User
from app.services import auth_service, email_service
from app.services.password_reset_email import build_password_reset_email, normalize_reset_locale
from app.utils.security import hash_password, verify_password


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


@pytest.mark.asyncio
async def test_request_password_reset_sends_email_and_stores_token(db_session, monkeypatch) -> None:
    user = await _create_user(db_session)
    send_mock = AsyncMock()
    monkeypatch.setattr(email_service, "send_email", send_mock)
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173")

    await auth_service.request_password_reset(db_session, user.email)

    send_mock.assert_awaited_once()
    kwargs = send_mock.await_args.kwargs
    assert kwargs["to"] == user.email
    assert "/reset-password/" in kwargs["body_text"]

    result = await db_session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used.is_(False),
        )
    )
    token_row = result.scalar_one()
    assert token_row.expires_at > datetime.now(UTC)


@pytest.mark.asyncio
async def test_reset_password_updates_hash_and_marks_token_used(db_session, monkeypatch) -> None:
    user = await _create_user(db_session)
    monkeypatch.setattr(email_service, "send_email", AsyncMock())

    captured_token: list[str] = []

    async def _capture_send(**kwargs):
        for line in kwargs["body_text"].splitlines():
            if "/reset-password/" in line:
                captured_token.append(line.strip().split("/reset-password/")[-1])

    monkeypatch.setattr(email_service, "send_email", _capture_send)

    await auth_service.request_password_reset(db_session, user.email)
    assert len(captured_token) == 1
    token_str = captured_token[0]

    await auth_service.reset_password(db_session, token_str, "newpassword2")

    await db_session.refresh(user)
    assert verify_password("newpassword2", user.password_hash)
    assert not verify_password("oldpassword1", user.password_hash)

    result = await db_session.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
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
    monkeypatch.setattr(email_service, "send_email", AsyncMock())

    captured_token: list[str] = []

    async def _capture_send(**kwargs):
        for line in kwargs["body_text"].splitlines():
            if "/reset-password/" in line:
                captured_token.append(line.strip().split("/reset-password/")[-1])

    monkeypatch.setattr(email_service, "send_email", _capture_send)
    await auth_service.request_password_reset(db_session, user.email)
    token_str = captured_token[0]

    result = await db_session.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
    )
    row = result.scalar_one()
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    with pytest.raises(ValueError, match="Invalid or expired"):
        await auth_service.reset_password(db_session, token_str, "newpassword2")


@pytest.mark.asyncio
async def test_reset_password_rejects_reused_token(db_session, monkeypatch) -> None:
    user = await _create_user(db_session)

    captured_token: list[str] = []

    async def _capture_send(**kwargs):
        for line in kwargs["body_text"].splitlines():
            if "/reset-password/" in line:
                captured_token.append(line.strip().split("/reset-password/")[-1])

    monkeypatch.setattr(email_service, "send_email", _capture_send)
    await auth_service.request_password_reset(db_session, user.email)
    token_str = captured_token[0]

    await auth_service.reset_password(db_session, token_str, "newpassword2")
    with pytest.raises(ValueError, match="Invalid or expired"):
        await auth_service.reset_password(db_session, token_str, "anotherpass3")


@pytest.mark.asyncio
async def test_bootstrap_admin_self_service_reset_silent_no_token(
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
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
    )
    assert result.scalar_one_or_none() is None


def test_normalize_reset_locale_defaults_to_ar() -> None:
    assert normalize_reset_locale(None) == "ar"
    assert normalize_reset_locale("ar") == "ar"


def test_normalize_reset_locale_english() -> None:
    assert normalize_reset_locale("en") == "en"
    assert normalize_reset_locale("en-US") == "en"


def test_build_password_reset_email_ar_and_en() -> None:
    url = "http://localhost:5173/reset-password/abc"
    sub_ar, _, _ = build_password_reset_email(locale="ar", reset_url=url, company_name="Mezan")
    sub_en, text_en, html_en = build_password_reset_email(
        locale="en", reset_url=url, company_name="Mezan"
    )
    assert "إعادة" in sub_ar
    assert "Reset" in sub_en
    assert url in text_en
    assert url in html_en


def test_build_password_reset_url() -> None:
    assert settings.build_password_reset_url("tok123") == (
        f"{settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password/tok123"
    )
