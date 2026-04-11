"""Employee, attendance, and leave-request business logic (Epic 4.1/4.2)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, StateTransitionError, ValidationError
from app.models.attendance_log import AttendanceLog
from app.models.employee_profile import EmployeeProfile
from app.models.leave_request import LeaveRequest, LeaveStatus, LeaveType
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


async def review_leave_request(
    db: AsyncSession, *, leave_request_id: int, action: str, reviewer_user_id: int
) -> LeaveRequest:
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
    await db.flush()
    await db.refresh(leave)
    return leave


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
