"""SRS attendance/payroll engine rules (leave vs absence, exempt roles, summaries)."""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.leave_request import LeaveRequest, LeaveStatus, LeaveType
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.services.attendance_payroll_engine import (
    compute_period_payroll_components,
    summarize_attendance_log_rows,
)
from app.services.attendance_policy_service import seed_default_policies
from app.services.seed_service import (
    ADMIN_ROLE_CODE,
    seed_accounting_defaults,
    seed_permissions_and_roles,
)
from app.utils.security import hash_password


def test_summarize_attendance_log_rows_counts_status_and_overtime() -> None:
    logs = [
        SimpleNamespace(classification_status="late", overtime_minutes=30),
        SimpleNamespace(classification_status="present", overtime_minutes=None),
    ]
    agg = summarize_attendance_log_rows(logs)  # type: ignore[arg-type]
    assert agg["by_status"]["late"] == 1
    assert agg["by_status"]["present"] == 1
    assert agg["overtime_minutes_total"] == 30.0
    assert agg["record_count"] == 2


@pytest.mark.anyio
async def test_compute_period_approved_leave_reduces_absence_auto_deductions(
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)
    await seed_accounting_defaults(db_session)
    await seed_default_policies(db_session)

    res_b = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = res_b.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    res_r = await db_session.execute(select(Role).where(Role.code == "CASHIER"))
    cashier_role = res_r.scalar_one()

    u = User(
        email="payroll_srs_cashier1@test.example",
        first_name="Cashier SRS",
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
    for wd in range(5):
        db_session.add(
            WeeklySchedule(
                employee_profile_id=ep.id,
                branch_id=store.id,
                weekday=wd,
                start_time=time(8, 0),
                end_time=time(17, 0),
                is_day_off=False,
            )
        )
    await db_session.commit()

    period_start = date(2026, 6, 1)
    period_end = date(2026, 6, 7)

    out_no_leave = await compute_period_payroll_components(
        db_session,
        employee_profile_id=ep.id,
        period_start=period_start,
        period_end=period_end,
        bonus=Decimal("0"),
        manual_deductions=Decimal("0"),
        hourly_rate_override=None,
    )
    assert out_no_leave["automatic_deductions_amount"] == Decimal("100.00")

    db_session.add(
        LeaveRequest(
            employee_profile_id=ep.id,
            leave_type=LeaveType.VACATION,
            status=LeaveStatus.APPROVED,
            start_date=date(2026, 6, 3),
            end_date=date(2026, 6, 3),
            reason=None,
        )
    )
    await db_session.commit()

    out_leave = await compute_period_payroll_components(
        db_session,
        employee_profile_id=ep.id,
        period_start=period_start,
        period_end=period_end,
        bonus=Decimal("0"),
        manual_deductions=Decimal("0"),
        hourly_rate_override=None,
    )
    assert out_leave["automatic_deductions_amount"] == Decimal("80.00")


@pytest.mark.anyio
async def test_compute_period_exempt_admin_role_has_zero_automatic_deductions(
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)
    await seed_accounting_defaults(db_session)
    await seed_default_policies(db_session)

    res_b = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = res_b.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    res_r = await db_session.execute(select(Role).where(Role.code == ADMIN_ROLE_CODE))
    admin_role = res_r.scalar_one()

    u = User(
        email="payroll_srs_admin1@test.example",
        first_name="Admin SRS",
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
        hourly_rate=Decimal("50.00"),
    )
    db_session.add(ep)
    await db_session.flush()

    db_session.add(UserRole(user_id=u.id, role_id=admin_role.id, branch_id=None))
    for wd in range(5):
        db_session.add(
            WeeklySchedule(
                employee_profile_id=ep.id,
                branch_id=store.id,
                weekday=wd,
                start_time=time(9, 0),
                end_time=time(17, 0),
                is_day_off=False,
            )
        )
    await db_session.commit()

    out = await compute_period_payroll_components(
        db_session,
        employee_profile_id=ep.id,
        period_start=date(2026, 6, 1),
        period_end=date(2026, 6, 7),
        bonus=Decimal("0"),
        manual_deductions=Decimal("0"),
        hourly_rate_override=None,
    )
    assert out["automatic_deductions_amount"] == Decimal("0")
