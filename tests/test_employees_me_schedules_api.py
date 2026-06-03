"""Self-service weekly schedule for the signed-in user (`GET /employees/me/schedules`)."""

from __future__ import annotations

from datetime import date, time
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
from app.models.weekly_schedule import WeeklySchedule
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import create_access_token, hash_password


@pytest.mark.anyio
async def test_my_schedules_ok_without_employees_read(
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
        email="me_schedules_user@test.example",
        first_name="Schedule User",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2025, 1, 1),
        base_salary=None,
        hourly_rate=Decimal("10.00"),
    )
    db_session.add(ep)
    await db_session.flush()

    db_session.add(UserRole(user_id=u.id, role_id=cashier_role.id, branch_id=None))
    db_session.add(
        WeeklySchedule(
            employee_profile_id=ep.id,
            branch_id=store.id,
            weekday=1,
            start_time=time(9, 0),
            end_time=time(17, 0),
            is_day_off=False,
        )
    )
    await db_session.commit()

    token = create_access_token(u.id)
    r = await client.get(
        "/api/v1/employees/me/schedules", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["weekday"] == 1


@pytest.mark.anyio
async def test_my_schedules_empty_when_no_employee_profile(
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
        email="no_employee_profile@test.example",
        first_name="No EP",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()

    db_session.add(UserRole(user_id=u.id, role_id=cashier_role.id, branch_id=None))
    await db_session.commit()

    token = create_access_token(u.id)
    r = await client.get(
        "/api/v1/employees/me/schedules", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200
    assert r.json() == []
