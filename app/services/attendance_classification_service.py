"""Classify attendance logs using weekly schedules and RBAC policy (SRS)."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance_log import AttendanceLog
from app.models.attendance_payroll_policy import AttendancePayrollPolicy
from app.models.employee_profile import EmployeeProfile
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.services.attendance_policy_service import resolve_effective_policy


def _utc_day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=UTC)
    return start, start + timedelta(days=1)


async def get_employee_org_role_code(db: AsyncSession, employee_profile_id: int) -> str | None:
    stmt = (
        select(Role.code)
        .select_from(EmployeeProfile)
        .join(User, EmployeeProfile.user_id == User.id)
        .outerjoin(
            UserRole,
            (UserRole.user_id == User.id) & (UserRole.branch_id.is_(None)),
        )
        .outerjoin(Role, UserRole.role_id == Role.id)
        .where(EmployeeProfile.id == employee_profile_id)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def _schedule_for_branch_weekday(
    db: AsyncSession, *, employee_profile_id: int, branch_id: int, weekday: int
) -> WeeklySchedule | None:
    res = await db.execute(
        select(WeeklySchedule)
        .where(
            WeeklySchedule.employee_profile_id == employee_profile_id,
            WeeklySchedule.branch_id == branch_id,
            WeeklySchedule.weekday == weekday,
        )
        .order_by(WeeklySchedule.id.asc())
        .limit(1)
    )
    return res.scalar_one_or_none()


def _sanitize_for_jsonb(value: object) -> object:
    """Make values JSON-serializable for PostgreSQL JSONB (no raw Decimal/datetime)."""
    if isinstance(value, dict):
        return {k: _sanitize_for_jsonb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_for_jsonb(v) for v in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _policy_snapshot(policy: AttendancePayrollPolicy | dict) -> dict:
    if isinstance(policy, AttendancePayrollPolicy):
        raw = {
            "role_code": policy.role_code,
            "attendance_category": policy.attendance_category,
            "grace_minutes": policy.grace_minutes,
            "absence_deduction_amount": policy.absence_deduction_amount,
            "late_deduction_amount": policy.late_deduction_amount,
            "early_close_deduction_amount": policy.early_close_deduction_amount,
            "overtime_multiplier": policy.overtime_multiplier,
        }
    else:
        raw = dict(policy)
    return _sanitize_for_jsonb(raw)


async def _is_first_clock_in_of_calendar_day(
    db: AsyncSession,
    *,
    employee_profile_id: int,
    clock_in_at: datetime,
    exclude_log_id: int | None,
) -> bool:
    day = clock_in_at.astimezone(UTC).date()
    lo, hi = _utc_day_bounds(day)
    q = (
        select(func.count())
        .select_from(AttendanceLog)
        .where(
            and_(
                AttendanceLog.employee_profile_id == employee_profile_id,
                AttendanceLog.clock_in_at >= lo,
                AttendanceLog.clock_in_at < hi,
                AttendanceLog.clock_in_at < clock_in_at,
            )
        )
    )
    if exclude_log_id is not None:
        q = q.where(AttendanceLog.id != exclude_log_id)
    res = await db.execute(q)
    return int(res.scalar_one() or 0) == 0


def _combine_utc(day: date, t: time) -> datetime:
    return datetime.combine(day, t, tzinfo=UTC)


async def refresh_attendance_log_classification(db: AsyncSession, log: AttendanceLog) -> None:
    """Persist classification fields on a single attendance log."""
    role_code = await get_employee_org_role_code(db, log.employee_profile_id)
    policy = await resolve_effective_policy(db, role_code=role_code)
    snap = _policy_snapshot(policy)
    cat = (
        policy.attendance_category
        if isinstance(policy, AttendancePayrollPolicy)
        else str(policy["attendance_category"])
    )
    grace = (
        policy.grace_minutes
        if isinstance(policy, AttendancePayrollPolicy)
        else int(policy["grace_minutes"])
    )

    log.attendance_category = cat
    log.policy_snapshot = snap

    if cat == "exempt":
        log.classification_status = "exempt_log"
        log.scheduled_start_at = None
        log.scheduled_end_at = None
        log.late_minutes = None
        log.early_close_minutes = None
        log.overtime_minutes = None
        log.payroll_impact_amount = Decimal("0")
        await db.flush()
        return

    day = log.clock_in_at.astimezone(UTC).date()
    weekday = day.weekday()  # Mon=0
    sched = await _schedule_for_branch_weekday(
        db,
        employee_profile_id=log.employee_profile_id,
        branch_id=log.branch_id,
        weekday=weekday,
    )
    if sched is None or sched.is_day_off:
        log.classification_status = "no_schedule"
        log.scheduled_start_at = None
        log.scheduled_end_at = None
        log.late_minutes = None
        log.early_close_minutes = None
        log.overtime_minutes = None
        log.payroll_impact_amount = Decimal("0")
        await db.flush()
        return

    start_dt = _combine_utc(day, sched.start_time)
    end_dt = _combine_utc(day, sched.end_time)
    log.scheduled_start_at = start_dt
    log.scheduled_end_at = end_dt

    if cat == "office":
        first = await _is_first_clock_in_of_calendar_day(
            db,
            employee_profile_id=log.employee_profile_id,
            clock_in_at=log.clock_in_at,
            exclude_log_id=log.id,
        )
        if not first:
            log.classification_status = "supplemental"
            log.late_minutes = None
            log.early_close_minutes = None
            log.overtime_minutes = None
            log.payroll_impact_amount = Decimal("0")
            await db.flush()
            return

        deadline = start_dt + timedelta(minutes=grace)
        if log.clock_in_at <= deadline:
            log.classification_status = "present"
            log.late_minutes = 0
        else:
            log.classification_status = "late"
            log.late_minutes = int(max(0, (log.clock_in_at - start_dt).total_seconds()) // 60)

        log.early_close_minutes = None
        log.overtime_minutes = None
        if log.clock_out_at:
            out = log.clock_out_at.astimezone(UTC)
            if out > end_dt:
                log.overtime_minutes = int((out - end_dt).total_seconds() // 60)
            if out < end_dt:
                log.early_close_minutes = int((end_dt - out).total_seconds() // 60)
                # office: early leave is informational unless we add policy; no auto amount on log
            else:
                log.early_close_minutes = 0
        log.payroll_impact_amount = Decimal("0")
        await db.flush()
        return

    # operational
    deadline = start_dt + timedelta(minutes=grace)
    if log.clock_in_at > deadline:
        log.classification_status = "operational_late_open"
        log.late_minutes = int(max(0, (log.clock_in_at - start_dt).total_seconds()) // 60)
    else:
        log.classification_status = "operational_open"
        log.late_minutes = 0

    log.early_close_minutes = None
    log.overtime_minutes = None
    if log.clock_out_at:
        out = log.clock_out_at.astimezone(UTC)
        if out < end_dt:
            log.early_close_minutes = int((end_dt - out).total_seconds() // 60)
            log.classification_status = "operational_early_close"
        elif out > end_dt:
            log.overtime_minutes = int((out - end_dt).total_seconds() // 60)
            log.classification_status = "operational_complete"
        else:
            log.classification_status = "operational_complete"
            log.early_close_minutes = 0
    log.payroll_impact_amount = Decimal("0")
    await db.flush()
