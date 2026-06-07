"""Two-factor authentication login flow."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest

from app.models.users import User
from app.services import auth_service, email_service, two_factor_service
from app.utils.security import hash_password


@pytest.mark.security
@pytest.mark.asyncio
async def test_login_with_2fa_returns_challenge(db_session, monkeypatch) -> None:
    user = User(
        email=f"2fa-{uuid.uuid4().hex[:8]}@example.com",
        status="active",
        password_hash=hash_password("password123"),
        two_factor_enabled=True,
    )
    db_session.add(user)
    await db_session.commit()

    monkeypatch.setattr(email_service, "send_email", AsyncMock())

    result = await auth_service.login_email_password(
        db_session, user.email, "password123"
    )
    assert result["requires_2fa"] is True
    assert result["challenge_token"]
    assert result["access_token"] is None


@pytest.mark.security
@pytest.mark.asyncio
async def test_verify_two_factor_issues_tokens(db_session, monkeypatch) -> None:
    user = User(
        email=f"2fa2-{uuid.uuid4().hex[:8]}@example.com",
        status="active",
        password_hash=hash_password("password123"),
        two_factor_enabled=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    sent_codes: list[str] = []

    async def _capture(**kwargs):
        for line in kwargs["body_text"].split():
            if line.isdigit() and len(line) == 6:
                sent_codes.append(line)

    monkeypatch.setattr(email_service, "send_email", _capture)

    challenge, otp = await two_factor_service.create_login_challenge(db_session, user)
    await db_session.commit()
    code = otp or (sent_codes[0] if sent_codes else None)
    assert code

    result = await auth_service.verify_two_factor_login(
        db_session, challenge_token=challenge, code=code
    )
    assert result["access_token"]
    assert result["refresh_token"]


@pytest.mark.security
@pytest.mark.anyio
async def test_toggle_two_factor_enable_requires_password(client, admin_auth_header) -> None:
    res = await client.patch(
        "/api/v1/auth/me/two-factor",
        headers=admin_auth_header,
        json={"enabled": True},
    )
    assert res.status_code == 422


@pytest.mark.security
@pytest.mark.anyio
async def test_toggle_two_factor_disable_without_password(client, admin_auth_header) -> None:
    enable = await client.patch(
        "/api/v1/auth/me/two-factor",
        headers=admin_auth_header,
        json={"enabled": True, "current_password": "password123"},
    )
    assert enable.status_code == 200
    assert enable.json()["two_factor_enabled"] is True

    disable = await client.patch(
        "/api/v1/auth/me/two-factor",
        headers=admin_auth_header,
        json={"enabled": False},
    )
    assert disable.status_code == 200
    assert disable.json()["two_factor_enabled"] is False
