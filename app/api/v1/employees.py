"""Employee HR APIs (Epic 4.1/4.2)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.employees import (
    AttendanceClockInRequest,
    AttendanceClockOutRequest,
    AttendanceLogRead,
    EmployeeProfileCreate,
    EmployeeProfileRead,
    EmployeeProfileUpdate,
    LeaveRequestCreate,
    LeaveRequestRead,
    LeaveRequestReview,
    WeeklyScheduleCreate,
    WeeklyScheduleRead,
    WeeklyScheduleUpdate,
)
from app.services import audit_service
from app.services.employee_service import (
    clock_in,
    clock_out,
    create_employee_profile,
    create_leave_request,
    create_weekly_schedule,
    get_employee_profile,
    list_attendance_logs,
    list_attendance_logs_filtered,
    list_employee_profiles,
    list_leave_requests,
    list_leave_requests_filtered,
    list_weekly_schedules,
    review_leave_request,
    soft_delete_leave_request,
    update_employee_profile,
    update_weekly_schedule,
)

router = APIRouter()


def _review_idempotency_key(request: Request, body_key: str | None) -> str | None:
    h = request.headers.get("Idempotency-Key")
    if h and len(h.strip()) >= 8:
        return h.strip()
    return body_key


@router.post("/employees", response_model=EmployeeProfileRead, status_code=status.HTTP_201_CREATED)
async def create_employee_profile_endpoint(
    body: EmployeeProfileCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "create"),
) -> EmployeeProfileRead:
    employee = await create_employee_profile(db, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="employee_profile.created",
        resource_type="employee_profile",
        resource_id=str(employee.id),
        new_value=EmployeeProfileRead.model_validate(employee).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return EmployeeProfileRead.model_validate(employee)


@router.get("/employees", response_model=list[EmployeeProfileRead])
async def list_employee_profiles_endpoint(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
) -> list[EmployeeProfileRead]:
    rows = await list_employee_profiles(db)
    return [EmployeeProfileRead.model_validate(r) for r in rows]


@router.get("/employees/{employee_profile_id}", response_model=EmployeeProfileRead)
async def get_employee_profile_endpoint(
    employee_profile_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
) -> EmployeeProfileRead:
    row = await get_employee_profile(db, employee_profile_id)
    return EmployeeProfileRead.model_validate(row)


@router.patch("/employees/{employee_profile_id}", response_model=EmployeeProfileRead)
async def update_employee_profile_endpoint(
    employee_profile_id: int,
    body: EmployeeProfileUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "update"),
) -> EmployeeProfileRead:
    row = await update_employee_profile(
        db,
        employee_profile_id=employee_profile_id,
        data=body.model_dump(exclude_unset=True),
    )
    await audit_service.log(
        session=db,
        action="employee_profile.updated",
        resource_type="employee_profile",
        resource_id=str(row.id),
        new_value=EmployeeProfileRead.model_validate(row).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return EmployeeProfileRead.model_validate(row)


@router.post(
    "/employees/{employee_profile_id}/schedules",
    response_model=WeeklyScheduleRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_schedule_endpoint(
    employee_profile_id: int,
    body: WeeklyScheduleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "update"),
) -> WeeklyScheduleRead:
    row = await create_weekly_schedule(
        db, employee_profile_id=employee_profile_id, data=body.model_dump()
    )
    await audit_service.log(
        session=db,
        action="weekly_schedule.created",
        resource_type="weekly_schedule",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return WeeklyScheduleRead.model_validate(row)


@router.get("/employees/{employee_profile_id}/schedules", response_model=list[WeeklyScheduleRead])
async def list_schedules_endpoint(
    employee_profile_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
) -> list[WeeklyScheduleRead]:
    rows = await list_weekly_schedules(db, employee_profile_id=employee_profile_id)
    return [WeeklyScheduleRead.model_validate(r) for r in rows]


@router.patch(
    "/employees/{employee_profile_id}/schedules/{schedule_id}",
    response_model=WeeklyScheduleRead,
)
async def update_schedule_endpoint(
    employee_profile_id: int,
    schedule_id: int,
    body: WeeklyScheduleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "update"),
) -> WeeklyScheduleRead:
    row = await update_weekly_schedule(
        db,
        employee_profile_id=employee_profile_id,
        schedule_id=schedule_id,
        data=body.model_dump(exclude_unset=True),
    )
    await audit_service.log(
        session=db,
        action="weekly_schedule.updated",
        resource_type="weekly_schedule",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return WeeklyScheduleRead.model_validate(row)


@router.post(
    "/employees/{employee_profile_id}/attendance/clock-in",
    response_model=AttendanceLogRead,
    status_code=status.HTTP_201_CREATED,
)
async def clock_in_endpoint(
    employee_profile_id: int,
    body: AttendanceClockInRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "update"),
) -> AttendanceLogRead:
    row = await clock_in(
        db,
        employee_profile_id=employee_profile_id,
        branch_id=body.branch_id,
        clock_in_at=body.clock_in_at,
    )
    await audit_service.log(
        session=db,
        action="attendance.clock_in",
        resource_type="attendance_log",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return AttendanceLogRead.model_validate(row)


@router.post(
    "/employees/{employee_profile_id}/attendance/clock-out", response_model=AttendanceLogRead
)
async def clock_out_endpoint(
    employee_profile_id: int,
    body: AttendanceClockOutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "update"),
) -> AttendanceLogRead:
    row = await clock_out(
        db, employee_profile_id=employee_profile_id, clock_out_at=body.clock_out_at
    )
    await audit_service.log(
        session=db,
        action="attendance.clock_out",
        resource_type="attendance_log",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return AttendanceLogRead.model_validate(row)


@router.get("/employees/{employee_profile_id}/attendance", response_model=list[AttendanceLogRead])
async def list_attendance_endpoint(
    employee_profile_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
) -> list[AttendanceLogRead]:
    rows = await list_attendance_logs(db, employee_profile_id=employee_profile_id)
    return [AttendanceLogRead.model_validate(r) for r in rows]


@router.get("/attendance/logs", response_model=list[AttendanceLogRead])
async def list_attendance_logs_global(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
    branch_id: int | None = None,
    employee_profile_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[AttendanceLogRead]:
    rows = await list_attendance_logs_filtered(
        db,
        branch_id=branch_id,
        employee_profile_id=employee_profile_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return [AttendanceLogRead.model_validate(r) for r in rows]


@router.post(
    "/employees/{employee_profile_id}/leave-requests",
    response_model=LeaveRequestRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_leave_request_endpoint(
    employee_profile_id: int,
    body: LeaveRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "create"),
) -> LeaveRequestRead:
    row = await create_leave_request(
        db, employee_profile_id=employee_profile_id, data=body.model_dump()
    )
    await audit_service.log(
        session=db,
        action="leave_request.created",
        resource_type="leave_request",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return LeaveRequestRead.model_validate(row)


@router.get(
    "/employees/{employee_profile_id}/leave-requests", response_model=list[LeaveRequestRead]
)
async def list_leave_requests_endpoint(
    employee_profile_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
) -> list[LeaveRequestRead]:
    rows = await list_leave_requests(db, employee_profile_id=employee_profile_id)
    return [LeaveRequestRead.model_validate(r) for r in rows]


@router.get("/leave-requests", response_model=list[LeaveRequestRead])
async def list_leave_requests_global(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
    status: str | None = None,
    employee_profile_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[LeaveRequestRead]:
    rows = await list_leave_requests_filtered(
        db,
        status=status,
        employee_profile_id=employee_profile_id,
        limit=limit,
        offset=offset,
    )
    return [LeaveRequestRead.model_validate(r) for r in rows]


@router.post("/leave-requests/{leave_request_id}/review", response_model=LeaveRequestRead)
async def review_leave_request_endpoint(
    leave_request_id: int,
    body: LeaveRequestReview,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "approve"),
) -> LeaveRequestRead:
    idem = _review_idempotency_key(request, body.idempotency_key)
    row, applied = await review_leave_request(
        db,
        leave_request_id=leave_request_id,
        action=body.action,
        reviewer_user_id=current_user.id,
        review_notes=body.review_notes,
        idempotency_key=idem,
    )
    if applied:
        await audit_service.log(
            session=db,
            action="leave_request.reviewed",
            resource_type="leave_request",
            resource_id=str(row.id),
            user_id=current_user.id,
            request=request,
        )
    await db.commit()
    return LeaveRequestRead.model_validate(row)


@router.delete("/leave-requests/{leave_request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_leave_request_endpoint(
    leave_request_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "delete"),
) -> None:
    row = await soft_delete_leave_request(db, leave_request_id=leave_request_id)
    await audit_service.log(
        session=db,
        action="leave_request.soft_deleted",
        resource_type="leave_request",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
