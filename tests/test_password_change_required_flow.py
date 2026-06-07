"""Login + restricted session for awaiting_verification users."""

from __future__ import annotations

import uuid

import pytest

from app.models.users import User
from app.utils.security import hash_password


@pytest.mark.security
@pytest.mark.anyio
async def test_awaiting_verification_login_then_permissions_gate(client, db_session) -> None:
    temp = "TempLogin1234"
    user = User(
        email=f"await-{uuid.uuid4().hex[:8]}@example.com",
        status="awaiting_verification",
        password_hash=hash_password(temp),
        must_change_password=True,
    )
    db_session.add(user)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": temp},
    )
    assert login.status_code == 200
    body = login.json()
    assert body["must_change_password"] is True
    token = body["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["must_change_password"] is True

    perms = await client.get("/api/v1/auth/me/permissions", headers=headers)
    assert perms.status_code == 403
    assert perms.json()["error"]["details"]["detail"] == "password_change_required"

    change = await client.post(
        "/api/v1/auth/change-password-required",
        headers=headers,
        json={"current_password": temp, "new_password": "NewSecure991"},
    )
    assert change.status_code == 200
    assert change.json()["must_change_password"] is False
    assert change.json()["status"] == "active"

    perms_after = await client.get("/api/v1/auth/me/permissions", headers=headers)
    assert perms_after.status_code == 200


@pytest.mark.security
@pytest.mark.anyio
async def test_refresh_allowed_while_password_change_required(client, db_session) -> None:
    temp = "TempRefresh123"
    user = User(
        email=f"refresh-{uuid.uuid4().hex[:8]}@example.com",
        status="awaiting_verification",
        password_hash=hash_password(temp),
        must_change_password=True,
    )
    db_session.add(user)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": temp},
    )
    refresh_token = login.json()["refresh_token"]

    refreshed = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
