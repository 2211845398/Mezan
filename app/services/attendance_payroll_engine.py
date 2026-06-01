"""Pay-period attendance totals for automatic payroll deductions (SRS)."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance_log import AttendanceLog
from app.models.attendance_payroll_policy import AttendancePayrollPolicy
from app.models.employee_profile import EmployeeProfile
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.services.attendance_classification_service import get_employee_org_role_code
from app.services.attendance_policy_service import resolve_effective_policy

MONEY_Q = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def _policy_rates(
    policy: AttendancePayrollPolicy | dict,
) -> tuple[str, Decimal, Decimal, Decimal]:
    if isinstance(policy, AttendancePayrollPolicy):
        return (
            policy.attendance_category,
            policy.late_deduction_amount,
            policy.early_close_deduction_amount,
            policy.overtime_multiplier,
        )
    return (
        str(policy["attendance_category"]),
        Decimal(str(policy["late_deduction_amount"])),
        Decimal(str(policy["early_close_deduction_amount"])),
        Decimal(str(policy["overtime_multiplier"])),
    )


def compute_log_payroll_impact_amount(
    log: AttendanceLog,
    policy: AttendancePayrollPolicy | dict,
    hourly_rate: Decimal,
) -> Decimal:
    """Signed net payroll effect for one log (+ overtime pay, − per-event deductions)."""
    category, late_rate, early_rate, ot_mult = _policy_rates(policy)
    rate = hourly_rate if hourly_rate is not None else Decimal("0")
    impact = Decimal("0")
    st = log.classification_status or ""

    if category == "office" and st == "late":
        impact -= late_rate
    elif category == "operational":
        if (log.late_minutes or 0) > 0:
            impact -= late_rate
        if (log.early_close_minutes or 0) > 0:
            impact -= early_rate

    ot_min = log.overtime_minutes or 0
    if ot_min > 0 and rate > 0:
        ot_hours = _q(Decimal(str(ot_min)) / Decimal("60"))
        impact += _q(ot_hours * rate * ot_mult)

    return _q(impact)


def _period_window(period_start: date, period_end: date) -> tuple[datetime, datetime]:
    start_dt = datetime.combine(period_start, time.min).replace(tzinfo=UTC)
    end_dt = datetime.combine(period_end + timedelta(days=1), time.min).replace(tzinfo=UTC)
    return start_dt, end_dt


async def _compute_hours_worked(
    db: AsyncSession,
    *,
    employee_profile_id: int,
    period_start: date,
    period_end: date,
) -> Decimal:
    window_start, window_end = _period_window(period_start, period_end)
    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.employee_profile_id == employee_profile_id,
                AttendanceLog.clock_out_at.is_not(None),
                AttendanceLog.clock_in_at < window_end,
                AttendanceLog.clock_out_at > window_start,
            )
        )
    )
    logs = list(result.scalars().all())
    total_seconds = Decimal("0")
    for log in logs:
        in_at = log.clock_in_at.astimezone(UTC)
        out_at = log.clock_out_at.astimezone(UTC)  # type: ignore[union-attr]
        if out_at <= in_at:
            continue
        overlap_start = max(in_at, window_start)
        overlap_end = min(out_at, window_end)
        if overlap_end <= overlap_start:
            continue
        total_seconds += Decimal(str((overlap_end - overlap_start).total_seconds()))
    return _q(total_seconds / Decimal("3600"))


def _dates_inclusive(start: date, end: date) -> list[date]:
    out: list[date] = []
    d = start
    while d <= end:
        out.append(d)
        d += timedelta(days=1)
    return out


async def _employee_default_branch_id(db: AsyncSession, employee_profile_id: int) -> int | None:
    res = await db.execute(
        select(User.branch_id)
        .select_from(EmployeeProfile)
        .join(User, EmployeeProfile.user_id == User.id)
        .where(EmployeeProfile.id == employee_profile_id)
    )
    return res.scalar_one_or_none()


async def _approved_leave_dates_in_period(
    db: AsyncSession, *, employee_profile_id: int, period_start: date, period_end: date
) -> set[date]:
    res = await db.execute(
        select(LeaveRequest).where(
            LeaveRequest.employee_profile_id == employee_profile_id,
            LeaveRequest.is_deleted.is_(False),
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.start_date <= period_end,
            LeaveRequest.end_date >= period_start,
        )
    )
    days: set[date] = set()
    for lr in res.scalars().all():
        s = max(lr.start_date, period_start)
        e = min(lr.end_date, period_end)
        days.update(_dates_inclusive(s, e))
    return days


async def _scheduled_work_dates(
    db: AsyncSession,
    *,
    employee_profile_id: int,
    branch_id: int | None,
    period_start: date,
    period_end: date,
) -> set[date]:
    if branch_id is None:
        return set()
    res = await db.execute(
        select(WeeklySchedule).where(
            WeeklySchedule.employee_profile_id == employee_profile_id,
            WeeklySchedule.branch_id == branch_id,
        )
    )
    rows = list(res.scalars().all())
    by_weekday: dict[int, WeeklySchedule] = {}
    for r in rows:
        # one row per weekday per branch expected; keep first
        if r.weekday not in by_weekday:
            by_weekday[r.weekday] = r

    work: set[date] = set()
    for d in _dates_inclusive(period_start, period_end):
        wd = d.weekday()
        sch = by_weekday.get(wd)
        if sch and not sch.is_day_off:
            work.add(d)
    return work


async def _attendance_dates_with_clock_in(
    db: AsyncSession, *, employee_profile_id: int, period_start: date, period_end: date
) -> set[date]:
    w0, w1 = _period_window(period_start, period_end)
    res = await db.execute(
        select(AttendanceLog.clock_in_at).where(
            and_(
                AttendanceLog.employee_profile_id == employee_profile_id,
                AttendanceLog.clock_in_at >= w0,
                AttendanceLog.clock_in_at < w1,
            )
        )
    )
    days: set[date] = set()
    for (ci,) in res.all():
        days.add(ci.astimezone(UTC).date())
    return days


async def compute_period_payroll_components(
    db: AsyncSession,
    *,
    employee_profile_id: int,
    period_start: date,
    period_end: date,
    bonus: Decimal,
    manual_deductions: Decimal,
    hourly_rate_override: Decimal | None,
) -> dict:
    """Return amounts and audit payload for payslip generation."""
    role_code = await get_employee_org_role_code(db, employee_profile_id)
    policy = await resolve_effective_policy(db, role_code=role_code)
    if isinstance(policy, dict):
        category = str(policy["attendance_category"])
        grace = int(policy["grace_minutes"])
        absence_rate = Decimal(str(policy["absence_deduction_amount"]))
        late_rate = Decimal(str(policy["late_deduction_amount"]))
        early_rate = Decimal(str(policy["early_close_deduction_amount"]))
        ot_mult = Decimal(str(policy["overtime_multiplier"]))
    else:
        category = policy.attendance_category
        grace = policy.grace_minutes
        absence_rate = policy.absence_deduction_amount
        late_rate = policy.late_deduction_amount
        early_rate = policy.early_close_deduction_amount
        ot_mult = policy.overtime_multiplier

    prof_res = await db.execute(
        select(EmployeeProfile).where(EmployeeProfile.id == employee_profile_id)
    )
    employee = prof_res.scalar_one()
    rate = hourly_rate_override if hourly_rate_override is not None else employee.hourly_rate
    if rate is None:
        rate = Decimal("0")

    hours_worked = await _compute_hours_worked(
        db,
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
    )

    branch_id = await _employee_default_branch_id(db, employee_profile_id)
    leave_days = await _approved_leave_dates_in_period(
        db,
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
    )
    work_dates = await _scheduled_work_dates(
        db,
        employee_profile_id=employee_profile_id,
        branch_id=branch_id,
        period_start=period_start,
        period_end=period_end,
    )
    attended = await _attendance_dates_with_clock_in(
        db,
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
    )

    billable = {d for d in work_dates if d not in leave_days}
    absent_days = {d for d in billable if d not in attended}

    w0, w1 = _period_window(period_start, period_end)
    logs_res = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.employee_profile_id == employee_profile_id,
                AttendanceLog.clock_in_at >= w0,
                AttendanceLog.clock_in_at < w1,
            )
        )
    )
    logs = list(logs_res.scalars().all())

    late_events = 0
    early_close_events = 0
    late_open_ops = 0
    ot_minutes_total = 0
    for log in logs:
        st = log.classification_status or ""
        if category == "office" and st == "late":
            late_events += 1
        if category == "operational":
            if (log.early_close_minutes or 0) > 0:
                early_close_events += 1
            if (log.late_minutes or 0) > 0:
                late_open_ops += 1
        if log.overtime_minutes:
            ot_minutes_total += int(log.overtime_minutes)

    ot_hours = _q(Decimal(str(ot_minutes_total)) / Decimal("60"))
    overtime_amount = _q(ot_hours * rate * ot_mult) if ot_hours > 0 else Decimal("0")

    auto = Decimal("0")
    if category == "exempt":
        auto = Decimal("0")
    else:
        auto += _q(Decimal(len(absent_days)) * absence_rate)
        if category == "office":
            auto += _q(Decimal(late_events) * late_rate)
        if category == "operational":
            auto += _q(Decimal(late_open_ops) * late_rate)
            auto += _q(Decimal(early_close_events) * early_rate)

    base_salary = employee.base_salary or Decimal("0")
    billable_list = sorted(billable)
    paid_days = max(0, len(billable_list) - len(absent_days))
    base_portion = Decimal("0")
    if base_salary > 0 and len(billable_list) > 0:
        daily = _q(base_salary / Decimal(len(billable_list)))
        base_portion = _q(daily * Decimal(paid_days))

    hourly_earnings = _q(hours_worked * rate)
    gross = _q(base_portion + hourly_earnings + overtime_amount + bonus)
    total_deductions = _q(auto + manual_deductions)
    net = _q(gross - total_deductions)

    details = {
        "role_code": role_code,
        "attendance_category": category,
        "policy_grace_minutes": grace,
        "scheduled_work_day_count": len(work_dates),
        "billable_work_day_count": len(billable),
        "approved_leave_day_count": len(leave_days & work_dates),
        "absent_dates": sorted(str(x) for x in absent_days),
        "late_events": late_events,
        "operational_late_open_count": late_open_ops,
        "operational_early_close_count": early_close_events,
        "overtime_hours": str(ot_hours),
        "hours_worked": str(hours_worked),
    }

    return {
        "base_salary_amount": base_portion,
        "bonus_amount": bonus,
        "overtime_amount": overtime_amount,
        "automatic_deductions_amount": auto,
        "manual_deductions_amount": manual_deductions,
        "hours_worked": hours_worked,
        "hourly_rate": _q(rate),
        "gross_amount": gross,
        "net_amount": net,
        "total_deductions": total_deductions,
        "calculation_details": details,
    }


async def count_absent_days_for_employee(
    db: AsyncSession,
    *,
    employee_profile_id: int,
    period_start: date,
    period_end: date,
) -> int:
    """Count scheduled billable days in range with no clock-in and no approved leave."""
    branch_id = await _employee_default_branch_id(db, employee_profile_id)
    leave_days = await _approved_leave_dates_in_period(
        db,
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
    )
    work_dates = await _scheduled_work_dates(
        db,
        employee_profile_id=employee_profile_id,
        branch_id=branch_id,
        period_start=period_start,
        period_end=period_end,
    )
    attended = await _attendance_dates_with_clock_in(
        db,
        employee_profile_id=employee_profile_id,
        period_start=period_start,
        period_end=period_end,
    )
    billable = {d for d in work_dates if d not in leave_days}
    absent_days = {d for d in billable if d not in attended}
    return len(absent_days)


def summarize_attendance_log_rows(logs: list[AttendanceLog]) -> dict[str, int | float]:
    """Aggregate counts from materialized attendance log rows (client-side summaries)."""
    by_status: dict[str, int] = {}
    ot_minutes = 0
    for log in logs:
        st = log.classification_status or "unknown"
        by_status[st] = by_status.get(st, 0) + 1
        ot_minutes += int(log.overtime_minutes or 0)
    return {
        "by_status": by_status,
        "overtime_minutes_total": float(ot_minutes),
        "record_count": len(logs),
    }
