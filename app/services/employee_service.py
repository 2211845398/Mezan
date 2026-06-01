"""Employee, attendance, and leave-request business logic (Epic 4.1/4.2)."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import and_, delete, select
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
from app.schemas.employees import LeaveRequestRead, VacationLeaveBalanceRead, WeeklyScheduleRead
from app.services.attendance_classification_service import refresh_attendance_log_classification
from app.services.identity_document_files import persist_raster_identity_scan
from app.utils.person_name import person_name_sql_expr


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


def _employee_enriched_select():
    return (
        select(
            EmployeeProfile,
            User.email.label("user_email"),
            User.first_name.label("user_first_name"),
            User.father_name.label("user_father_name"),
            User.family_name.label("user_family_name"),
            person_name_sql_expr(User.first_name, User.father_name, User.family_name).label(
                "user_full_name"
            ),
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
    )


def _row_to_enriched(row) -> dict:
    employee = row[0]
    return {
        "employee": employee,
        "user_email": row.user_email,
        "user_first_name": row.user_first_name,
        "user_father_name": row.user_father_name,
        "user_family_name": row.user_family_name,
        "user_full_name": row.user_full_name,
        "user_status": row.user_status,
        "user_branch_id": row.user_branch_id,
        "user_branch_name": row.user_branch_name,
        "user_role_code": row.user_role_code,
        "user_role_name": row.user_role_name,
    }


async def list_employee_profiles_enriched(db: AsyncSession) -> list[dict]:
    """Return all employee profiles with enriched user, branch, and role details."""
    stmt = _employee_enriched_select().order_by(EmployeeProfile.id.asc())
    result = await db.execute(stmt)
    return [_row_to_enriched(row) for row in result.all()]


async def list_employee_profiles_enriched_page(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Paginated enriched employee list."""
    from sqlalchemy import func

    from app.schemas.pagination import clamp_pagination

    limit, offset = clamp_pagination(limit, offset)
    total = int(
        await db.scalar(select(func.count()).select_from(EmployeeProfile)) or 0
    )
    id_res = await db.execute(
        select(EmployeeProfile.id)
        .order_by(EmployeeProfile.id.asc())
        .limit(limit)
        .offset(offset)
    )
    ids = list(id_res.scalars().all())
    if not ids:
        return [], total
    stmt = (
        _employee_enriched_select()
        .where(EmployeeProfile.id.in_(ids))
        .order_by(EmployeeProfile.id.asc())
    )
    result = await db.execute(stmt)
    return [_row_to_enriched(row) for row in result.all()], total


async def get_employee_profile_enriched(db: AsyncSession, employee_profile_id: int) -> dict:
    """Return one employee profile with the same user/branch/role enrichment as list."""
    stmt = (
        select(
            EmployeeProfile,
            User.email.label("user_email"),
            User.first_name.label("user_first_name"),
            User.father_name.label("user_father_name"),
            User.family_name.label("user_family_name"),
            person_name_sql_expr(User.first_name, User.father_name, User.family_name).label(
                "user_full_name"
            ),
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
        .where(EmployeeProfile.id == employee_profile_id)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if row is None:
        raise NotFoundError(
            "Employee profile not found", details={"employee_profile_id": employee_profile_id}
        )
    employee = row[0]
    return {
        "employee": employee,
        "user_email": row.user_email,
        "user_first_name": row.user_first_name,
        "user_father_name": row.user_father_name,
        "user_family_name": row.user_family_name,
        "user_full_name": row.user_full_name,
        "user_status": row.user_status,
        "user_branch_id": row.user_branch_id,
        "user_branch_name": row.user_branch_name,
        "user_role_code": row.user_role_code,
        "user_role_name": row.user_role_name,
    }


async def get_employee_profile(db: AsyncSession, employee_profile_id: int) -> EmployeeProfile:
    return await _get_employee_profile(db, employee_profile_id)


async def _apply_employee_subject_user_updates(
    db: AsyncSession,
    *,
    user_id: int,
    data: dict,
) -> None:
    """Update display name, branch, and org-level role for the employee's linked user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("User not found", details={"user_id": user_id})

    if "subject_first_name" in data:
        v = data["subject_first_name"]
        user.first_name = v.strip() if isinstance(v, str) and v.strip() else None
    if "subject_father_name" in data:
        v = data["subject_father_name"]
        user.father_name = v.strip() if isinstance(v, str) and v.strip() else None
    if "subject_family_name" in data:
        v = data["subject_family_name"]
        user.family_name = v.strip() if isinstance(v, str) and v.strip() else None

    if "subject_branch_id" in data:
        bid = data["subject_branch_id"]
        if bid is not None:
            br = await db.execute(select(Branch).where(Branch.id == bid))
            if br.scalar_one_or_none() is None:
                raise ValidationError("Branch not found", details={"branch_id": bid})
        user.branch_id = bid

    if "subject_role_code" in data:
        raw = (data["subject_role_code"] or "").strip().upper()
        if not raw:
            raise ValidationError(
                "subject_role_code cannot be empty",
                details={"code": "role_required"},
            )
        role_res = await db.execute(select(Role).where(Role.code == raw))
        role = role_res.scalar_one_or_none()
        if role is None:
            raise ValidationError("Role code not found", details={"role_code": raw})
        await db.execute(
            delete(UserRole).where(
                UserRole.user_id == user.id,
                UserRole.branch_id.is_(None),
            ),
        )
        db.add(UserRole(user_id=user.id, role_id=role.id, branch_id=None))

    await db.flush()
    await db.refresh(user)


async def update_employee_profile(
    db: AsyncSession, *, employee_profile_id: int, data: dict
) -> EmployeeProfile:
    employee = await _get_employee_profile(db, employee_profile_id)
    patch = dict(data)
    subject_keys = (
        "subject_first_name",
        "subject_father_name",
        "subject_family_name",
        "subject_branch_id",
        "subject_role_code",
    )
    subject_patch = {k: patch.pop(k) for k in subject_keys if k in patch}

    for key, value in patch.items():
        setattr(employee, key, value)

    if subject_patch:
        await _apply_employee_subject_user_updates(db, user_id=employee.user_id, data=subject_patch)

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


async def list_weekly_schedules_for_authenticated_user(
    db: AsyncSession, *, user_id: int
) -> list[WeeklySchedule]:
    """Return the signed-in user's weekly schedule rows (self-service; no ``employees:read``)."""
    res = await db.execute(select(EmployeeProfile).where(EmployeeProfile.user_id == user_id))
    profile = res.scalar_one_or_none()
    if profile is None:
        return []
    result = await db.execute(
        select(WeeklySchedule)
        .where(WeeklySchedule.employee_profile_id == profile.id)
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

    if "branch_id" in data and data["branch_id"] is not None:
        bid = data["branch_id"]
        br = await db.execute(select(Branch).where(Branch.id == bid))
        if br.scalar_one_or_none() is None:
            raise ValidationError("Branch not found", details={"branch_id": bid})

    for key, value in data.items():
        setattr(schedule, key, value)
    if not schedule.is_day_off and schedule.end_time <= schedule.start_time:
        raise ValidationError("end_time must be after start_time")
    await db.flush()
    await db.refresh(schedule)
    return schedule


async def delete_weekly_schedule(
    db: AsyncSession, *, employee_profile_id: int, schedule_id: int
) -> dict:
    """Remove one weekly schedule row; returns serialized row for audit."""
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
    payload = WeeklyScheduleRead.model_validate(schedule).model_dump()
    await db.delete(schedule)
    await db.flush()
    return payload


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
    await refresh_attendance_log_classification(db, log)
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
    await refresh_attendance_log_classification(db, log)
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


def _vacation_overlap_days_in_year(req_start: date, req_end: date, year: int) -> int:
    ys, ye = date(year, 1, 1), date(year, 12, 31)
    s = max(req_start, ys)
    e = min(req_end, ye)
    if s > e:
        return 0
    return (e - s).days + 1


async def _approved_vacation_used_by_profile_for_year(
    db: AsyncSession,
    *,
    employee_profile_ids: list[int],
    year: int,
) -> dict[int, Decimal]:
    if not employee_profile_ids:
        return {}
    ys, ye = date(year, 1, 1), date(year, 12, 31)
    result = await db.execute(
        select(LeaveRequest).where(
            LeaveRequest.employee_profile_id.in_(employee_profile_ids),
            LeaveRequest.is_deleted.is_(False),
            LeaveRequest.leave_type == LeaveType.VACATION,
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.end_date >= ys,
            LeaveRequest.start_date <= ye,
        )
    )
    rows = list(result.scalars().all())
    acc: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for lv in rows:
        days = _vacation_overlap_days_in_year(lv.start_date, lv.end_date, year)
        acc[lv.employee_profile_id] += Decimal(days)
    return dict(acc)


async def vacation_balance_remaining_by_profile(
    db: AsyncSession,
    *,
    employee_profile_ids: list[int],
    reference_date: date | None = None,
) -> dict[int, Decimal | None]:
    uniq = list(dict.fromkeys(employee_profile_ids))
    if not uniq:
        return {}
    ref = reference_date or datetime.now(UTC).date()
    year = ref.year
    ent_result = await db.execute(
        select(EmployeeProfile.id, EmployeeProfile.annual_leave_entitlement_days).where(
            EmployeeProfile.id.in_(uniq)
        )
    )
    entitlements: dict[int, Decimal | None] = {
        row.id: row.annual_leave_entitlement_days for row in ent_result.all()
    }
    used_map = await _approved_vacation_used_by_profile_for_year(
        db, employee_profile_ids=uniq, year=year
    )
    out: dict[int, Decimal | None] = {}
    for ep_id in uniq:
        ent = entitlements.get(ep_id)
        if ent is None:
            out[ep_id] = None
            continue
        used = used_map.get(ep_id, Decimal("0"))
        remaining = ent - used
        if remaining < 0:
            remaining = Decimal("0")
        out[ep_id] = remaining
    return out


async def get_vacation_leave_balance(
    db: AsyncSession,
    *,
    employee_profile_id: int,
    reference_date: date | None = None,
) -> VacationLeaveBalanceRead:
    ref = reference_date or datetime.now(UTC).date()
    year = ref.year
    ep = await _get_employee_profile(db, employee_profile_id)
    used_map = await _approved_vacation_used_by_profile_for_year(
        db, employee_profile_ids=[employee_profile_id], year=year
    )
    used = used_map.get(employee_profile_id, Decimal("0"))
    ent = ep.annual_leave_entitlement_days
    remaining: Decimal | None = None if ent is None else max(Decimal("0"), ent - used)
    return VacationLeaveBalanceRead(
        calendar_year=year,
        entitlement_days=ent,
        used_days=used,
        remaining_days=remaining,
    )


async def enrich_leave_request_reads(
    db: AsyncSession, rows: list[LeaveRequest]
) -> list[LeaveRequestRead]:
    if not rows:
        return []
    balance_map = await vacation_balance_remaining_by_profile(
        db,
        employee_profile_ids=[r.employee_profile_id for r in rows],
    )
    out: list[LeaveRequestRead] = []
    for r in rows:
        payload = LeaveRequestRead.model_validate(r).model_dump()
        payload["vacation_balance_remaining"] = balance_map.get(r.employee_profile_id)
        out.append(LeaveRequestRead.model_validate(payload))
    return out


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
    q = (
        q.order_by(LeaveRequest.created_at.desc())
        .limit(min(max(limit, 1), 500))
        .offset(max(offset, 0))
    )
    result = await db.execute(q)
    return list(result.scalars().all())


async def list_attendance_logs_filtered(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    employee_profile_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    classification_status: str | None = None,
    attendance_category: str | None = None,
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
    if classification_status:
        q = q.where(AttendanceLog.classification_status == classification_status)
    if attendance_category:
        q = q.where(AttendanceLog.attendance_category == attendance_category)
    q = (
        q.order_by(AttendanceLog.clock_in_at.desc())
        .limit(min(max(limit, 1), 500))
        .offset(max(offset, 0))
    )
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


async def attendance_period_summary(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    employee_profile_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Roll-up counts for HR dashboards; absent_days only when a single employee is scoped."""
    from app.services.attendance_payroll_engine import (
        count_absent_days_for_employee,
        summarize_attendance_log_rows,
    )

    logs = await list_attendance_logs_filtered(
        db,
        branch_id=branch_id,
        employee_profile_id=employee_profile_id,
        date_from=date_from,
        date_to=date_to,
        limit=500,
        offset=0,
    )
    agg = summarize_attendance_log_rows(logs)
    absent_days = 0
    if employee_profile_id is not None and date_from is not None and date_to is not None:
        absent_days = await count_absent_days_for_employee(
            db,
            employee_profile_id=employee_profile_id,
            period_start=date_from,
            period_end=date_to,
        )
    return {**agg, "absent_days": absent_days}


async def save_employee_identity_document_image(
    db: AsyncSession, *, employee_profile_id: int, file_body: bytes
) -> EmployeeProfile:
    employee = await _get_employee_profile(db, employee_profile_id)
    url = persist_raster_identity_scan(basename=f"employee-{employee_profile_id}", file_body=file_body)
    employee.identity_document_image_url = url
    await db.flush()
    await db.refresh(employee)
    return employee


async def get_employee_profile_id_for_user(db: AsyncSession, user_id: int) -> int | None:
    res = await db.execute(select(EmployeeProfile.id).where(EmployeeProfile.user_id == user_id))
    return res.scalar_one_or_none()
