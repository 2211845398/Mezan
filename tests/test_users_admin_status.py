"""Admin user status and role assignment guards."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.utils.security import hash_password


@pytest.mark.asyncio
async def test_cannot_deactivate_self(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    res = await db_session.execute(select(User).where(User.email == "admin@example.com"))
    admin = res.scalar_one()

    resp = await client.patch(
        f"/api/v1/users/{admin.id}",
        json={"status": "deactivated"},
        headers=admin_auth_header,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["details"]["detail"] == "cannot_deactivate_self"


@pytest.mark.asyncio
async def test_cannot_assign_role_to_deactivated_user(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    deactivated = User(
        email="deactivated-role@test.local",
        first_name="Off",
        password_hash=hash_password("password123"),
        status="deactivated",
    )
    db_session.add(deactivated)
    await db_session.flush()

    role_res = await db_session.execute(select(Role).where(Role.code == "CASHIER"))
    cashier_role = role_res.scalar_one()
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/users/{deactivated.id}/roles",
        json={"role_id": cashier_role.id, "branch_id": None},
        headers=admin_auth_header,
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["details"]["detail"] == "user_deactivated_cannot_assign_role"
