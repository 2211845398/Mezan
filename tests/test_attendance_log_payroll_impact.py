"""Per-log payroll_impact_amount aligned with attendance payroll engine rules."""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from decimal import Decimal
from types import SimpleNamespace

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance_log import AttendanceLog
from app.models.attendance_payroll_policy import AttendancePayrollPolicy
from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.services.attendance_classification_service import refresh_attendance_log_classification
from app.services.attendance_payroll_engine import compute_log_payroll_impact_amount
from app.services.attendance_policy_service import seed_default_policies
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import hash_password

_UNIQUE = "zzattpayimp01"


def test_compute_log_payroll_impact_office_late_deduction() -> None:
    policy = SimpleNamespace(
        attendance_category="office",
        late_deduction_amount=Decimal("25.00"),
        early_close_deduction_amount=Decimal("10.00"),
        overtime_multiplier=Decimal("1.50"),
    )
    log = SimpleNamespace(
        classification_status="late",
        late_minutes=15,
        early_close_minutes=None,
        overtime_minutes=None,
    )
    assert compute_log_payroll_impact_amount(log, policy, Decimal("10")) == Decimal("-25.00")  # type: ignore[arg-type]


def test_compute_log_payroll_impact_overtime_credit() -> None:
    policy = SimpleNamespace(
        attendance_category="office",
        late_deduction_amount=Decimal("25.00"),
        early_close_deduction_amount=Decimal("10.00"),
        overtime_multiplier=Decimal("1.50"),
    )
    log = SimpleNamespace(
        classification_status="present",
        late_minutes=0,
        early_close_minutes=0,
        overtime_minutes=60,
    )
    # 1 hour * 10 * 1.5 = 15.00
    assert compute_log_payroll_impact_amount(log, policy, Decimal("10")) == Decimal("15.00")  # type: ignore[arg-type]


def test_compute_log_payroll_impact_operational_early_close() -> None:
    policy = SimpleNamespace(
        attendance_category="operational",
        late_deduction_amount=Decimal("20.00"),
        early_close_deduction_amount=Decimal("12.00"),
        overtime_multiplier=Decimal("1.50"),
    )
    log = SimpleNamespace(
        classification_status="operational_early_close",
        late_minutes=0,
        early_close_minutes=30,
        overtime_minutes=None,
    )
    assert compute_log_payroll_impact_amount(log, policy, Decimal("8")) == Decimal("-12.00")  # type: ignore[arg-type]


@pytest.mark.anyio
async def test_refresh_classification_sets_payroll_impact_for_late_office_log(
    db_session: AsyncSession,
) -> None:
    await seed_permissions_and_roles(db_session)
    await seed_default_policies(db_session)

    br_res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = br_res.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    res_r = await db_session.execute(select(Role).where(Role.code == "HR_MANAGER"))
    hr_role = res_r.scalar_one()

    u = User(
        email=f"{_UNIQUE}@test.example",
        first_name="Pay",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()
    db_session.add(UserRole(user_id=u.id, role_id=hr_role.id, branch_id=None))
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2025, 1, 1),
        hourly_rate=Decimal("10.00"),
    )
    db_session.add(ep)
    await db_session.flush()

    day = date(2025, 6, 10)
    db_session.add(
        WeeklySchedule(
            employee_profile_id=ep.id,
            branch_id=store.id,
            weekday=day.weekday(),
            start_time=time(9, 0),
            end_time=time(17, 0),
            is_day_off=False,
        )
    )
    await db_session.flush()

    policy_res = await db_session.execute(
        select(AttendancePayrollPolicy).where(AttendancePayrollPolicy.role_code == "HR_MANAGER")
    )
    policy = policy_res.scalar_one()
    late_rate = policy.late_deduction_amount

    log = AttendanceLog(
        employee_profile_id=ep.id,
        branch_id=store.id,
        clock_in_at=datetime.combine(day, time(10, 30), tzinfo=UTC),
        clock_out_at=datetime.combine(day, time(17, 0), tzinfo=UTC),
    )
    db_session.add(log)
    await db_session.flush()

    await refresh_attendance_log_classification(db_session, log)
    await db_session.refresh(log)

    assert log.classification_status == "late"
    assert log.payroll_impact_amount == -late_rate


@pytest.mark.anyio
async def test_list_attendance_returns_persisted_payroll_impact(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_auth_header: dict[str, str],
) -> None:
    await seed_permissions_and_roles(db_session)
    await seed_default_policies(db_session)

    br_res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = br_res.scalar_one()

    res_r = await db_session.execute(select(Role).where(Role.code == "CASHIER"))
    cashier_role = res_r.scalar_one()

    u = User(
        email=f"{_UNIQUE}2@test.example",
        first_name="Pay2",
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()
    db_session.add(UserRole(user_id=u.id, role_id=cashier_role.id, branch_id=None))

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2025, 1, 1),
        hourly_rate=Decimal("10.00"),
    )
    db_session.add(ep)
    await db_session.flush()

    day = date(2025, 6, 11)
    db_session.add(
        WeeklySchedule(
            employee_profile_id=ep.id,
            branch_id=store.id,
            weekday=day.weekday(),
            start_time=time(9, 0),
            end_time=time(17, 0),
            is_day_off=False,
        )
    )
    log = AttendanceLog(
        employee_profile_id=ep.id,
        branch_id=store.id,
        clock_in_at=datetime.combine(day, time(9, 0), tzinfo=UTC),
        clock_out_at=datetime.combine(day, time(18, 0), tzinfo=UTC),
    )
    db_session.add(log)
    await db_session.flush()
    await refresh_attendance_log_classification(db_session, log)
    await db_session.commit()

    day_str = day.isoformat()
    res = await client.get(
        "/api/v1/attendance/logs",
        params={
            "date_from": day_str,
            "date_to": day_str,
            "employee_profile_id": ep.id,
            "limit": 10,
            "offset": 0,
        },
        headers=admin_auth_header,
    )
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["overtime_minutes"] == 60
    assert Decimal(items[0]["payroll_impact_amount"]) > 0
