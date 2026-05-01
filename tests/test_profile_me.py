"""PATCH /api/v1/auth/me profile updates."""

import pytest
from sqlalchemy import select

from app.models.users import User
from app.utils.security import hash_password, verify_password


@pytest.mark.anyio
async def test_patch_me_sets_avatar_url(client, admin_auth_header):
    res = await client.patch(
        "/api/v1/auth/me",
        headers=admin_auth_header,
        json={
            "avatar_url": "https://example.com/photo.png",
            "full_name": "Admin",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["avatar_url"] == "https://example.com/photo.png"


@pytest.mark.anyio
async def test_patch_me_email_conflict(client, admin_auth_header, db_session):
    other = User(
        email="taken@example.com",
        full_name="Other",
        password_hash=hash_password("password123"),
        status="active",
        branch_id=None,
    )
    db_session.add(other)
    await db_session.commit()

    res = await client.patch(
        "/api/v1/auth/me",
        headers=admin_auth_header,
        json={"email": "taken@example.com"},
    )
    assert res.status_code == 409
    assert "Email" in (res.json().get("detail") or "")


@pytest.mark.anyio
async def test_patch_me_wrong_current_password(client, admin_auth_header):
    res = await client.patch(
        "/api/v1/auth/me",
        headers=admin_auth_header,
        json={"current_password": "not-the-password", "new_password": "newpassw0rd"},
    )
    assert res.status_code == 400
    assert "Current password" in (res.json().get("detail") or "")


@pytest.mark.anyio
async def test_patch_me_password_change(client, admin_auth_header, db_session):
    res = await client.patch(
        "/api/v1/auth/me",
        headers=admin_auth_header,
        json={"current_password": "password123", "new_password": "newpassw0rd"},
    )
    assert res.status_code == 200

    u = await db_session.execute(select(User).where(User.email == "admin@example.com"))
    user = u.scalar_one()

    assert verify_password("newpassw0rd", user.password_hash)

    # restore for other tests in the same DB session
    user.password_hash = hash_password("password123")
    await db_session.commit()
