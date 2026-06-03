"""Self-service leave for the signed-in user (no ``employees:create``)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import create_access_token, hash_password


@pytest.mark.anyio
async def test_my_leave_request_ok_without_employees_create(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)

    res_b = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = res_b.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    res_r = await db_session.execute(select(Role).where(Role.code == "CASHIER"))
    cashier_role = res_r.scalar_one()

    u = User(
        email="me_leave_user@test.example",
        first_name="Leave",
        family_name="User",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2024, 1, 1),
        base_salary=Decimal("1000.00"),
    )
    db_session.add(ep)
    db_session.add(UserRole(user_id=u.id, role_id=cashier_role.id))
    await db_session.commit()

    token = create_access_token(u.id)
    r = await client.post(
        "/api/v1/employees/me/leave-requests",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "leave_type": "vacation",
            "start_date": "2026-07-01",
            "end_date": "2026-07-03",
            "reason": "self-service test",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["employee_profile_id"] == ep.id
    assert body["status"] == "pending"
