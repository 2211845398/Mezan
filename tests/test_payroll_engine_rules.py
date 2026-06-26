"""Payroll engine: pay basis by role, overtime isolation, deduction cap."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance_log import AttendanceLog
from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.payslip import Payslip
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.services.attendance_payroll_engine import (
    _apply_deduction_cap,
    compute_period_payroll_components,
)
from app.services.attendance_policy_service import seed_default_policies
from app.services.payroll_service import (
    approve_payslip,
    generate_payslip,
    get_payroll_period_snapshot,
    prepare_payroll_period_drafts,
)
from app.services.seed_service import seed_accounting_defaults, seed_permissions_and_roles
from app.utils.security import hash_password


def test_apply_deduction_cap_limits_to_gross() -> None:
    auto, manual, total, net = _apply_deduction_cap(
        Decimal("90.00"), Decimal("80.00"), Decimal("500.00")
    )
    assert auto == Decimal("80.00")
    assert manual == Decimal("10.00")
    assert total == Decimal("90.00")
    assert net == Decimal("0.00")


def test_apply_deduction_cap_no_change_when_under_gross() -> None:
    auto, manual, total, net = _apply_deduction_cap(
        Decimal("500.00"), Decimal("50.00"), Decimal("25.00")
    )
    assert auto == Decimal("50.00")
    assert manual == Decimal("25.00")
    assert total == Decimal("75.00")
    assert net == Decimal("425.00")


async def _employee_with_role(
    db_session: AsyncSession,
    *,
    email: str,
    role_code: str,
    base_salary: Decimal | None,
    hourly_rate: Decimal | None,
) -> tuple[EmployeeProfile, Branch]:
    await seed_permissions_and_roles(db_session)
    await seed_accounting_defaults(db_session)
    await seed_default_policies(db_session)

    res_b = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = res_b.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    res_r = await db_session.execute(select(Role).where(Role.code == role_code))
    role = res_r.scalar_one()

    u = User(
        email=email,
        first_name="Payroll",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2025, 1, 1),
        base_salary=base_salary,
        hourly_rate=hourly_rate,
    )
    db_session.add(ep)
    await db_session.flush()

    db_session.add(UserRole(user_id=u.id, role_id=role.id, branch_id=None))
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
    return ep, store


def _add_weekday_attendance(
    db_session: AsyncSession,
    *,
    ep: EmployeeProfile,
    store: Branch,
    period_start: date,
    period_end: date,
    hours: int = 8,
) -> None:
    cur = period_start
    while cur <= period_end:
        if cur.weekday() < 5:
            db_session.add(
                AttendanceLog(
                    employee_profile_id=ep.id,
                    branch_id=store.id,
                    clock_in_at=datetime.combine(cur, time(8, 0), tzinfo=UTC),
                    clock_out_at=datetime.combine(cur, time(8 + hours, 0), tzinfo=UTC),
                )
            )
        cur += timedelta(days=1)


@pytest.mark.anyio
async def test_operational_employee_uses_hourly_not_base_salary(db_session: AsyncSession) -> None:
    ep, store = await _employee_with_role(
        db_session,
        email="payroll_ops_dual@test.example",
        role_code="CASHIER",
        base_salary=Decimal("5000.00"),
        hourly_rate=Decimal("10.00"),
    )
    _add_weekday_attendance(
        db_session, ep=ep, store=store, period_start=date(2026, 6, 1), period_end=date(2026, 6, 7)
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
    assert out["base_salary_amount"] == Decimal("0.00")
    assert out["gross_amount"] == Decimal("400.00")
    assert out["calculation_details"]["pay_basis"] == "hourly"


@pytest.mark.anyio
async def test_office_employee_uses_base_salary_not_hourly(db_session: AsyncSession) -> None:
    ep, store = await _employee_with_role(
        db_session,
        email="payroll_office_dual@test.example",
        role_code="HR_MANAGER",
        base_salary=Decimal("3000.00"),
        hourly_rate=Decimal("100.00"),
    )
    _add_weekday_attendance(
        db_session, ep=ep, store=store, period_start=date(2026, 6, 1), period_end=date(2026, 6, 7)
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
    assert out["base_salary_amount"] == Decimal("3000.00")
    assert out["gross_amount"] == Decimal("3000.00")
    assert out["calculation_details"]["pay_basis"] == "salary"


@pytest.mark.anyio
async def test_overtime_is_not_paid_twice_in_period_gross(db_session: AsyncSession) -> None:
    ep, store = await _employee_with_role(
        db_session,
        email="payroll_ot@test.example",
        role_code="CASHIER",
        base_salary=None,
        hourly_rate=Decimal("10.00"),
    )
    db_session.add(
        AttendanceLog(
            employee_profile_id=ep.id,
            branch_id=store.id,
            clock_in_at=datetime.combine(date(2026, 6, 1), time(8, 0), tzinfo=UTC),
            clock_out_at=datetime.combine(date(2026, 6, 1), time(17, 0), tzinfo=UTC),
            overtime_minutes=60,
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
    assert out["gross_amount"] == Decimal("95.00")
    assert out["overtime_amount"] == Decimal("15.00")
    assert out["gross_amount"] != Decimal("105.00")


@pytest.mark.anyio
async def test_deductions_capped_at_gross_with_balanced_net(db_session: AsyncSession) -> None:
    ep, store = await _employee_with_role(
        db_session,
        email="payroll_cap@test.example",
        role_code="CASHIER",
        base_salary=None,
        hourly_rate=Decimal("10.00"),
    )
    db_session.add(
        AttendanceLog(
            employee_profile_id=ep.id,
            branch_id=store.id,
            clock_in_at=datetime.combine(date(2026, 6, 1), time(8, 0), tzinfo=UTC),
            clock_out_at=datetime.combine(date(2026, 6, 1), time(17, 0), tzinfo=UTC),
        )
    )
    await db_session.commit()

    out = await compute_period_payroll_components(
        db_session,
        employee_profile_id=ep.id,
        period_start=date(2026, 6, 1),
        period_end=date(2026, 6, 7),
        bonus=Decimal("0"),
        manual_deductions=Decimal("500.00"),
        hourly_rate_override=None,
    )
    gross = out["gross_amount"]
    auto = out["automatic_deductions_amount"]
    manual = out["manual_deductions_amount"]
    net = out["net_amount"]
    assert gross == Decimal("90.00")
    assert net == Decimal("0.00")
    assert auto + manual == gross
    assert out["calculation_details"]["deductions_capped"] is True


@pytest.mark.anyio
async def test_prepare_and_approve_balanced_payslip(db_session: AsyncSession) -> None:
    ep, _store = await _employee_with_role(
        db_session,
        email="payroll_approve_bal@test.example",
        role_code="CASHIER",
        base_salary=None,
        hourly_rate=Decimal("10.00"),
    )
    period_start = date(2026, 6, 10)
    period_end = date(2026, 6, 15)

    payslip, _created = await generate_payslip(
        db_session,
        employee_profile_id=ep.id,
        period_start=period_start,
        period_end=period_end,
        deductions=Decimal("0"),
    )
    await db_session.commit()

    assert payslip.gross_amount == payslip.deductions + payslip.net_amount
    assert payslip.net_amount >= Decimal("0")

    approved, applied = await approve_payslip(
        db_session,
        payslip_id=payslip.id,
        approver_user_id=1,
        idempotency_key="approve-bal-test-01",
    )
    await db_session.commit()
    assert applied is True
    assert approved.status.value == "approved"


@pytest.mark.anyio
async def test_prepare_high_absence_month_clamps_deductions(db_session: AsyncSession) -> None:
    ep, _store = await _employee_with_role(
        db_session,
        email="payroll_prepare_cap@test.example",
        role_code="CASHIER",
        base_salary=None,
        hourly_rate=Decimal("10.00"),
    )
    result = await prepare_payroll_period_drafts(db_session, year=2026, month=12)
    await db_session.commit()
    failures = [f for f in result["failures"] if f["employee_profile_id"] == ep.id]
    assert failures == []

    snap = await get_payroll_period_snapshot(db_session, year=2026, month=12)
    row = next(r for r in snap["rows"] if r["employee_profile_id"] == ep.id)
    gross = Decimal(str(row["gross_amount"]))
    net = Decimal(str(row["net_amount"]))
    auto = Decimal(str(row["automatic_deductions_amount"] or "0"))
    manual = Decimal(str(row["manual_deductions_amount"] or "0"))
    assert net == Decimal("0.00")
    assert auto + manual == gross

    ps_res = await db_session.execute(select(Payslip).where(Payslip.id == row["payslip_id"]))
    ps = ps_res.scalar_one()
    assert ps.calculation_details is not None
    assert ps.calculation_details.get("deductions_capped") is True
