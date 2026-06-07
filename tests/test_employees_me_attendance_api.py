"""Self-service attendance for the signed-in employee."""

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


def _qr(branch_id: int) -> str:
    return f"mezan:attendance:v1:branch:{branch_id}"


@pytest.mark.security
@pytest.mark.asyncio
async def test_my_attendance_clock_in_and_out(
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
        email="me_attendance_user@test.example",
        first_name="Attend",
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
    await db_session.commit()

    token = create_access_token(u.id)
    headers = {"Authorization": f"Bearer {token}"}

    r_in = await client.post(
        "/api/v1/employees/me/attendance/clock-in",
        headers=headers,
        json={"qr_payload": _qr(store.id)},
    )
    assert r_in.status_code == 201
    log_id = r_in.json()["id"]
    assert r_in.json()["clock_out_at"] is None

    r_dup = await client.post(
        "/api/v1/employees/me/attendance/clock-in",
        headers=headers,
        json={"qr_payload": _qr(store.id)},
    )
    assert r_dup.status_code == 409

    r_out = await client.post(
        "/api/v1/employees/me/attendance/clock-out",
        headers=headers,
        json={"qr_payload": _qr(store.id)},
    )
    assert r_out.status_code == 200
    assert r_out.json()["id"] == log_id
    assert r_out.json()["clock_out_at"] is not None

    r_list = await client.get("/api/v1/employees/me/attendance", headers=headers)
    assert r_list.status_code == 200
    assert len(r_list.json()) >= 1


@pytest.mark.security
@pytest.mark.asyncio
async def test_my_attendance_rejects_invalid_qr(
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
        email="me_attendance_bad_qr@test.example",
        first_name="Bad",
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
    await db_session.commit()

    token = create_access_token(u.id)
    r = await client.post(
        "/api/v1/employees/me/attendance/clock-in",
        headers={"Authorization": f"Bearer {token}"},
        json={"qr_payload": "not-a-valid-qr"},
    )
    assert r.status_code == 422
