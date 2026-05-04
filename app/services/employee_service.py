"""Employee, attendance, and leave-request business logic (Epic 4.1/4.2)."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, StateTransitionError, ValidationError
from app.models.attendance_log import AttendanceLog
from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.leave_request import LeaveRequest, LeaveStatus, LeaveType
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule


def _to_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(UTC)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


async def _get_employee_profile(db: AsyncSession, employee_profile_id: int) -> EmployeeProfile:
    result = await db.execute(
        select(EmployeeProfile).where(EmployeeProfile.id == employee_profile_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise NotFoundError(
            "Employee profile not found", details={"employee_profile_id": employee_profile_id}
        )
    return employee


async def create_employee_profile(db: AsyncSession, *, data: dict) -> EmployeeProfile:
    user_id = data["user_id"]
    user_result = await db.execute(select(User).where(User.id == user_id))
    if user_result.scalar_one_or_none() is None:
        raise ValidationError("User does not exist", details={"user_id": user_id})

    existing = await db.execute(select(EmployeeProfile).where(EmployeeProfile.user_id == user_id))
    if existing.scalar_one_or_none():
        raise ValidationError("Employee profile already exists for this user")

    if data.get("base_salary") is None and data.get("hourly_rate") is None:
        raise ValidationError("Either base_salary or hourly_rate must be provided")

    employee = EmployeeProfile(**data)
    db.add(employee)
    await db.flush()
    await db.refresh(employee)
    return employee


async def list_employee_profiles(db: AsyncSession) -> list[EmployeeProfile]:
    result = await db.execute(select(EmployeeProfile).order_by(EmployeeProfile.id.asc()))
    return list(result.scalars().all())


async def list_employee_profiles_enriched(db: AsyncSession) -> list[dict]:
    """Return employee profiles with enriched user, branch, and role details."""
    stmt = (
        select(
            EmployeeProfile,
            User.email.label("user_email"),
            User.full_name.label("user_full_name"),
            User.status.label("user_status"),
            User.branch_id.label("user_branch_id"),
            Branch.name.label("user_branch_name"),
            Role.code.label("user_role_code"),
            Role.name.label("user_role_name"),
        )
        .join(User, EmployeeProfile.user_id == User.id)
        .outerjoin(Branch, User.branch_id == Branch.id)
        .outerjoin(
            UserRole,
            (UserRole.user_id == User.id) & (UserRole.branch_id.is_(None)),
        )
        .outerjoin(Role, UserRole.role_id == Role.id)
        .order_by(EmployeeProfile.id.asc())
    )
    result = await db.execute(stmt)

    enriched = []
    for row in result.all():
        employee = row[0]
        enriched.append({
            "employee": employee,
            "user_email": row.user_email,
            "user_full_name": row.user_full_name,
            "user_status": row.user_status,
            "user_branch_id": row.user_branch_id,
            "user_branch_name": row.user_branch_name,
            "user_role_code": row.user_role_code,
            "user_role_name": row.user_role_name,
        })

    return enriched


async def get_employee_profile(db: AsyncSession, employee_profile_id: int) -> EmployeeProfile:
    return await _get_employee_profile(db, employee_profile_id)


async def update_employee_profile(
    db: AsyncSession, *, employee_profile_id: int, data: dict
) -> EmployeeProfile:
    employee = await _get_employee_profile(db, employee_profile_id)
    for key, value in data.items():
        setattr(employee, key, value)
    await db.flush()
    await db.refresh(employee)
    return employee


async def create_weekly_schedule(
    db: AsyncSession, *, employee_profile_id: int, data: dict
) -> WeeklySchedule:
    await _get_employee_profile(db, employee_profile_id)
    if not data.get("is_day_off") and data["end_time"] <= data["start_time"]:
        raise ValidationError("end_time must be after start_time")

    schedule = WeeklySchedule(employee_profile_id=employee_profile_id, **data)
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)
    return schedule


async def list_weekly_schedules(
    db: AsyncSession, *, employee_profile_id: int
) -> list[WeeklySchedule]:
    await _get_employee_profile(db, employee_profile_id)
    result = await db.execute(
        select(WeeklySchedule)
        .where(WeeklySchedule.employee_profile_id == employee_profile_id)
        .order_by(WeeklySchedule.weekday.asc(), WeeklySchedule.start_time.asc())
    )
    return list(result.scalars().all())


async def update_weekly_schedule(
    db: AsyncSession, *, employee_profile_id: int, schedule_id: int, data: dict
) -> WeeklySchedule:
    await _get_employee_profile(db, employee_profile_id)
    result = await db.execute(
        select(WeeklySchedule).where(
            and_(
                WeeklySchedule.id == schedule_id,
                WeeklySchedule.employee_profile_id == employee_profile_id,
            )
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise NotFoundError("Weekly schedule not found", details={"schedule_id": schedule_id})

    for key, value in data.items():
        setattr(schedule, key, value)
    if not schedule.is_day_off and schedule.end_time <= schedule.start_time:
        raise ValidationError("end_time must be after start_time")
    await db.flush()
    await db.refresh(schedule)
    return schedule


async def clock_in(
    db: AsyncSession, *, employee_profile_id: int, branch_id: int, clock_in_at: datetime | None
) -> AttendanceLog:
    await _get_employee_profile(db, employee_profile_id)
    open_result = await db.execute(
        select(AttendanceLog).where(
            AttendanceLog.employee_profile_id == employee_profile_id,
            AttendanceLog.clock_out_at.is_(None),
        )
    )
    if open_result.scalar_one_or_none():
        raise StateTransitionError("Cannot clock in while a shift is still open")

    log = AttendanceLog(
        employee_profile_id=employee_profile_id,
        branch_id=branch_id,
        clock_in_at=_to_utc(clock_in_at),
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return log


async def clock_out(
    db: AsyncSession, *, employee_profile_id: int, clock_out_at: datetime | None
) -> AttendanceLog:
    await _get_employee_profile(db, employee_profile_id)
    result = await db.execute(
        select(AttendanceLog)
        .where(
            AttendanceLog.employee_profile_id == employee_profile_id,
            AttendanceLog.clock_out_at.is_(None),
        )
        .order_by(AttendanceLog.clock_in_at.desc())
    )
    log = result.scalar_one_or_none()
    if not log:
        raise StateTransitionError("No open attendance log to clock out")

    out_at = _to_utc(clock_out_at)
    if out_at <= log.clock_in_at:
        raise ValidationError("clock_out_at must be after clock_in_at")
    log.clock_out_at = out_at
    await db.flush()
    await db.refresh(log)
    return log


async def list_attendance_logs(
    db: AsyncSession, *, employee_profile_id: int
) -> list[AttendanceLog]:
    await _get_employee_profile(db, employee_profile_id)
    result = await db.execute(
        select(AttendanceLog)
        .where(AttendanceLog.employee_profile_id == employee_profile_id)
        .order_by(AttendanceLog.clock_in_at.desc())
    )
    return list(result.scalars().all())


async def create_leave_request(
    db: AsyncSession, *, employee_profile_id: int, data: dict
) -> LeaveRequest:
    await _get_employee_profile(db, employee_profile_id)
    if data["end_date"] < data["start_date"]:
        raise ValidationError("end_date must be on or after start_date")
    leave = LeaveRequest(
        employee_profile_id=employee_profile_id,
        leave_type=LeaveType(data["leave_type"]),
        start_date=data["start_date"],
        end_date=data["end_date"],
        reason=data.get("reason"),
    )
    db.add(leave)
    await db.flush()
    await db.refresh(leave)
    return leave


async def list_leave_requests(db: AsyncSession, *, employee_profile_id: int) -> list[LeaveRequest]:
    await _get_employee_profile(db, employee_profile_id)
    result = await db.execute(
        select(LeaveRequest)
        .where(
            LeaveRequest.employee_profile_id == employee_profile_id,
            LeaveRequest.is_deleted.is_(False),
        )
        .order_by(LeaveRequest.created_at.desc())
    )
    return list(result.scalars().all())


async def list_leave_requests_filtered(
    db: AsyncSession,
    *,
    status: str | None = None,
    employee_profile_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[LeaveRequest]:
    q = select(LeaveRequest).where(LeaveRequest.is_deleted.is_(False))
    if status is not None:
        q = q.where(LeaveRequest.status == LeaveStatus(status))
    if employee_profile_id is not None:
        q = q.where(LeaveRequest.employee_profile_id == employee_profile_id)
    q = q.order_by(LeaveRequest.created_at.desc()).limit(min(max(limit, 1), 500)).offset(max(offset, 0))
    result = await db.execute(q)
    return list(result.scalars().all())


async def list_attendance_logs_filtered(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    employee_profile_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[AttendanceLog]:
    q = select(AttendanceLog)
    if employee_profile_id is not None:
        q = q.where(AttendanceLog.employee_profile_id == employee_profile_id)
    if branch_id is not None:
        q = q.where(AttendanceLog.branch_id == branch_id)
    if date_from is not None:
        start_dt = datetime.combine(date_from, time.min).replace(tzinfo=UTC)
        q = q.where(AttendanceLog.clock_in_at >= start_dt)
    if date_to is not None:
        end_dt = datetime.combine(date_to + timedelta(days=1), time.min).replace(tzinfo=UTC)
        q = q.where(AttendanceLog.clock_in_at < end_dt)
    q = q.order_by(AttendanceLog.clock_in_at.desc()).limit(min(max(limit, 1), 500)).offset(max(offset, 0))
    result = await db.execute(q)
    return list(result.scalars().all())


async def review_leave_request(
    db: AsyncSession,
    *,
    leave_request_id: int,
    action: str,
    reviewer_user_id: int,
    review_notes: str | None = None,
    idempotency_key: str | None = None,
) -> tuple[LeaveRequest, bool]:
    if idempotency_key is not None and len(idempotency_key) < 8:
        raise ValidationError(
            "idempotency_key must be at least 8 characters",
            details={"field": "idempotency_key"},
        )
    if idempotency_key is not None:
        prior = await db.execute(
            select(LeaveRequest).where(LeaveRequest.review_idempotency_key == idempotency_key)
        )
        found = prior.scalar_one_or_none()
        if found:
            if found.id != leave_request_id:
                raise ConflictError(
                    "Idempotency key already used for a different leave request",
                    details={"leave_request_id": found.id},
                )
            return found, False

    result = await db.execute(
        select(LeaveRequest).where(
            LeaveRequest.id == leave_request_id,
            LeaveRequest.is_deleted.is_(False),
        )
    )
    leave = result.scalar_one_or_none()
    if not leave:
        raise NotFoundError(
            "Leave request not found", details={"leave_request_id": leave_request_id}
        )
    if leave.status != LeaveStatus.PENDING:
        raise StateTransitionError("Only pending leave requests can be reviewed")

    leave.status = LeaveStatus.APPROVED if action == "approve" else LeaveStatus.REJECTED
    leave.reviewed_by_user_id = reviewer_user_id
    leave.reviewed_at = datetime.now(UTC)
    leave.review_notes = review_notes
    if idempotency_key:
        leave.review_idempotency_key = idempotency_key
    await db.flush()
    await db.refresh(leave)
    return leave, True


async def soft_delete_leave_request(db: AsyncSession, *, leave_request_id: int) -> LeaveRequest:
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == leave_request_id))
    leave = result.scalar_one_or_none()
    if not leave:
        raise NotFoundError(
            "Leave request not found", details={"leave_request_id": leave_request_id}
        )
    if leave.is_deleted:
        return leave
    leave.is_deleted = True
    leave.deleted_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(leave)
    return leave
