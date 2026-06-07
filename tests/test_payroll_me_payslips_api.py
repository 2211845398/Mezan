"""Self-service payroll payslips for the signed-in employee."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.payslip import Payslip, PayslipStatus
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.services.payroll_service import calendar_month_period_bounds
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import create_access_token, hash_password


@pytest.mark.security
@pytest.mark.asyncio
async def test_my_payslips_only_returns_own_records(
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
        email="me_payroll_user@test.example",
        first_name="Pay",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2025, 1, 1),
        base_salary=Decimal("1000.00"),
        hourly_rate=Decimal("10.00"),
    )
    db_session.add(ep)
    await db_session.flush()
    db_session.add(UserRole(user_id=u.id, role_id=cashier_role.id, branch_id=None))

    period_start, period_end = calendar_month_period_bounds(2026, 5)
    db_session.add(
        Payslip(
            employee_profile_id=ep.id,
            period_start=period_start,
            period_end=period_end,
            hours_worked=Decimal("160"),
            hourly_rate=Decimal("10"),
            deductions=Decimal("0"),
            gross_amount=Decimal("1000"),
            net_amount=Decimal("1000"),
            status=PayslipStatus.APPROVED,
            immutable_hash="test-hash-me-payroll",
            base_salary_amount=Decimal("1000"),
            bonus_amount=Decimal("0"),
            overtime_amount=Decimal("0"),
            automatic_deductions_amount=Decimal("0"),
            manual_deductions_amount=Decimal("0"),
        )
    )
    await db_session.commit()

    token = create_access_token(u.id)
    headers = {"Authorization": f"Bearer {token}"}

    r_list = await client.get("/api/v1/payroll/me/payslips", headers=headers)
    assert r_list.status_code == 200
    data = r_list.json()
    assert data["total"] == 1
    assert data["items"][0]["employee_profile_id"] == ep.id
    assert data["items"][0]["display_status"] == "approved"

    r_month = await client.get("/api/v1/payroll/me/payslips/2026/5", headers=headers)
    assert r_month.status_code == 200
    assert r_month.json()["net_amount"] == "1000.00"

    r_missing = await client.get("/api/v1/payroll/me/payslips/2026/1", headers=headers)
    assert r_missing.status_code == 404
