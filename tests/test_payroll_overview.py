"""Payroll overview rows: no live preview, prepare fills drafts, legacy null fallback."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from secrets import token_hex

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.attendance_log import AttendanceLog
from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.payslip import Payslip, PayslipStatus
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.services.attendance_policy_service import seed_default_policies
from app.services.payroll_service import (
    calendar_month_period_bounds,
    get_payroll_period_snapshot,
    list_payroll_overview,
    prepare_payroll_period_drafts,
    validate_employee_payroll_ready,
)
from app.services.seed_service import seed_accounting_defaults, seed_permissions_and_roles
from app.utils.security import hash_password

_UNIQUE = "zzpayoverview01"


async def _active_hourly_employee(db_session: AsyncSession) -> EmployeeProfile:
    await seed_permissions_and_roles(db_session)
    await seed_accounting_defaults(db_session)
    await seed_default_policies(db_session)

    br_res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = br_res.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    res_r = await db_session.execute(select(Role).where(Role.code == "CASHIER"))
    cashier_role = res_r.scalar_one()

    u = User(
        email=f"{_UNIQUE}@test.example",
        first_name="Overview",
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
    return ep


@pytest.mark.anyio
async def test_overview_no_payslip_has_null_amounts(db_session: AsyncSession) -> None:
    ep = await _active_hourly_employee(db_session)
    period_start, period_end = calendar_month_period_bounds(2026, 6)

    rows = await list_payroll_overview(db_session, period_start=period_start, period_end=period_end)
    row = next(r for r in rows if r["employee_profile_id"] == ep.id)
    assert row["payslip_status"] == "no_payslip"
    assert row["gross_amount"] is None
    assert row["net_amount"] is None
    assert row["automatic_deductions_amount"] is None


@pytest.mark.anyio
async def test_overview_after_prepare_draft_amounts_consistent(db_session: AsyncSession) -> None:
    ep = await _active_hourly_employee(db_session)
    year, month = 2026, 6

    result = await prepare_payroll_period_drafts(db_session, year=year, month=month)
    await db_session.commit()
    assert result["created_count"] >= 1

    snap = await get_payroll_period_snapshot(db_session, year=year, month=month)
    row = next(r for r in snap["rows"] if r["employee_profile_id"] == ep.id)
    assert row["payslip_status"] == PayslipStatus.DRAFT.value
    assert row["gross_amount"] is not None
    assert row["net_amount"] is not None

    gross = Decimal(str(row["gross_amount"]))
    net = Decimal(str(row["net_amount"]))
    auto = Decimal(str(row["automatic_deductions_amount"] or "0"))
    manual = Decimal(str(row["manual_deductions_amount"] or "0"))
    assert net == gross - auto - manual


@pytest.mark.anyio
async def test_overview_legacy_draft_null_breakdown_uses_fallback(db_session: AsyncSession) -> None:
    ep = await _active_hourly_employee(db_session)
    period_start, period_end = calendar_month_period_bounds(2026, 7)

    db_session.add(
        Payslip(
            employee_profile_id=ep.id,
            period_start=period_start,
            period_end=period_end,
            hours_worked=Decimal("0"),
            hourly_rate=Decimal("10"),
            deductions=Decimal("0"),
            gross_amount=Decimal("0"),
            net_amount=Decimal("0"),
            status=PayslipStatus.DRAFT,
            immutable_hash=token_hex(16),
            automatic_deductions_amount=None,
            manual_deductions_amount=None,
            overtime_amount=None,
            bonus_amount=None,
            base_salary_amount=None,
        )
    )
    await db_session.commit()

    rows = await list_payroll_overview(db_session, period_start=period_start, period_end=period_end)
    row = next(r for r in rows if r["employee_profile_id"] == ep.id)
    assert row["automatic_deductions_amount"] is not None
    assert row["gross_amount"] is not None
    assert row["net_amount"] is not None


@pytest.mark.anyio
async def test_validate_payroll_ready_requires_weekly_schedule(db_session: AsyncSession) -> None:
    ep = await _active_hourly_employee(db_session)
    period_start, period_end = calendar_month_period_bounds(2026, 8)

    sched_res = await db_session.execute(
        select(WeeklySchedule).where(WeeklySchedule.employee_profile_id == ep.id)
    )
    for row in sched_res.scalars().all():
        await db_session.delete(row)
    await db_session.commit()

    with pytest.raises(ValidationError, match="weekly work schedule"):
        await validate_employee_payroll_ready(
            db_session,
            employee_profile_id=ep.id,
            period_start=period_start,
            period_end=period_end,
        )


@pytest.mark.anyio
async def test_prepare_recalculates_existing_zero_draft(db_session: AsyncSession) -> None:
    ep = await _active_hourly_employee(db_session)
    period_start, period_end = calendar_month_period_bounds(2026, 9)

    u_res = await db_session.execute(select(User).where(User.id == ep.user_id))
    user = u_res.scalar_one()
    d = period_start
    while d <= period_end:
        if d.weekday() < 5:
            db_session.add(
                AttendanceLog(
                    employee_profile_id=ep.id,
                    branch_id=user.branch_id,
                    clock_in_at=datetime.combine(d, time(8, 0), tzinfo=UTC),
                    clock_out_at=datetime.combine(d, time(17, 0), tzinfo=UTC),
                )
            )
        d += timedelta(days=1)
    await db_session.flush()

    db_session.add(
        Payslip(
            employee_profile_id=ep.id,
            period_start=period_start,
            period_end=period_end,
            hours_worked=Decimal("0"),
            hourly_rate=Decimal("10"),
            deductions=Decimal("0"),
            gross_amount=Decimal("0"),
            net_amount=Decimal("0"),
            status=PayslipStatus.DRAFT,
            immutable_hash=token_hex(16),
            automatic_deductions_amount=Decimal("0"),
            manual_deductions_amount=Decimal("0"),
            bonus_amount=Decimal("0"),
            overtime_amount=Decimal("0"),
            base_salary_amount=Decimal("0"),
        )
    )
    await db_session.commit()

    result = await prepare_payroll_period_drafts(db_session, year=2026, month=9)
    await db_session.commit()
    assert result["recalculated_count"] >= 1

    snap = await get_payroll_period_snapshot(db_session, year=2026, month=9)
    row = next(r for r in snap["rows"] if r["employee_profile_id"] == ep.id)
    assert Decimal(str(row["gross_amount"])) > Decimal("0")


@pytest.mark.anyio
async def test_prepare_failure_negative_net_in_failures(db_session: AsyncSession) -> None:
    ep = await _active_hourly_employee(db_session)
    period_start, period_end = calendar_month_period_bounds(2026, 10)

    result = await prepare_payroll_period_drafts(db_session, year=2026, month=10)
    row_failures = [f for f in result["failures"] if f["employee_profile_id"] == ep.id]
    assert len(row_failures) == 1
    assert row_failures[0].get("code") == "payroll_negative_net"
