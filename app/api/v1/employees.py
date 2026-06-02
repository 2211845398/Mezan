"""Employee HR APIs (Epic 4.1/4.2)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    STAFF_SELF_SERVICE_ANY,
    get_current_user,
    require_any_permission,
    require_permission,
)
from app.core.config import settings
from app.core.errors import ValidationError
from app.db.database import get_db
from app.models.employee_profile import EmployeeProfile
from app.models.leave_request import LeaveStatus, LeaveType
from app.models.users import User
from app.schemas.employees import (
    AttendanceClockInRequest,
    AttendanceClockOutRequest,
    AttendanceLogListResponse,
    AttendanceLogRead,
    AttendanceSummaryRead,
    EmployeeListResponse,
    EmployeeProfileCreate,
    EmployeeProfileRead,
    EmployeeProfileUpdate,
    IdentityDocumentImageResponse,
    LeaveRequestCreate,
    LeaveRequestRead,
    LeaveRequestReview,
    VacationLeaveBalanceRead,
    WeeklyScheduleCreate,
    WeeklyScheduleRead,
    WeeklyScheduleUpdate,
)
from app.schemas.pagination import clamp_pagination
from app.services import audit_service
from app.services.employee_service import (
    attendance_period_summary,
    clock_in,
    clock_out,
    create_employee_profile,
    create_leave_request,
    create_weekly_schedule,
    delete_weekly_schedule,
    enrich_leave_request_reads,
    get_employee_profile_enriched,
    get_vacation_leave_balance,
    list_attendance_logs,
    list_attendance_logs_enriched_page,
    list_employee_profiles_enriched_page,
    list_leave_requests,
    list_leave_requests_filtered,
    get_employee_profile_id_for_user,
    list_weekly_schedules,
    list_weekly_schedules_for_authenticated_user,
    review_leave_request,
    save_employee_identity_document_image,
    soft_delete_leave_request,
    update_employee_profile,
    update_weekly_schedule,
)
from app.services.notifications.service import (
    dispatch_delivery_after_commit,
    enqueue_direct_notification,
)

router = APIRouter()


def _leave_type_label_ar(leave_type: LeaveType) -> str:
    return {
        LeaveType.VACATION: "إجازة سنوية",
        LeaveType.SICK: "إجازة مرضية",
        LeaveType.PERSONAL: "إجازة شخصية",
    }.get(leave_type, "إجازة")


def _leave_period_phrase(start: date, end: date) -> str:
    return f"من {start} إلى {end}"


def _append_ref_note(body: str, note: str | None) -> str:
    text = (note or "").strip()
    if not text:
        return body
    return f"{body}\n\nملاحظة المرجع:\n{text}"


async def _finalize_created_leave_request(
    db: AsyncSession,
    *,
    request: Request,
    current_user: User,
    employee_profile_id: int,
    body: LeaveRequestCreate,
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
    reads = await enrich_leave_request_reads(db, [row])
    delivery_id: int | None = None
    ep = await db.get(EmployeeProfile, row.employee_profile_id)
    if ep is not None:
        kind_ar = _leave_type_label_ar(row.leave_type)
        period = _leave_period_phrase(row.start_date, row.end_date)
        title = "تم استلام طلب إجازتك"
        body_txt = f"تم تسجيل طلب {kind_ar} (رقم {row.id}) للفترة {period}."
        body_txt = _append_ref_note(body_txt, row.reason)
        delivery_id = await enqueue_direct_notification(
            db,
            user_id=ep.user_id,
            title=title,
            body=body_txt,
            template_kind="leave_request_submitted",
            idempotency_key=f"leave_req_submitted:{row.id}",
            data={"leave_request_id": row.id, "path": "/profile"},
            provider_name=None,
            default_push_provider=settings.PUSH_PROVIDER,
        )
    await db.commit()
    if delivery_id is not None:
        await dispatch_delivery_after_commit(
            delivery_id, default_push_provider=settings.PUSH_PROVIDER
        )
    return reads[0]


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


def _employee_row_to_read(row: dict) -> EmployeeProfileRead:
    employee = row["employee"]
    data = EmployeeProfileRead.model_validate(employee).model_dump()
    data.update(
        {
            "user_email": row["user_email"],
            "user_first_name": row["user_first_name"],
            "user_father_name": row["user_father_name"],
            "user_family_name": row["user_family_name"],
            "user_full_name": row["user_full_name"],
            "user_status": row["user_status"],
            "user_branch_id": row["user_branch_id"],
            "user_branch_name": row["user_branch_name"],
            "user_role_code": row["user_role_code"],
            "user_role_name": row["user_role_name"],
        }
    )
    return EmployeeProfileRead.model_validate(data)


@router.get("/employees", response_model=EmployeeListResponse)
async def list_employee_profiles_endpoint(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=200),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
) -> EmployeeListResponse:
    rows, total = await list_employee_profiles_enriched_page(
        db, limit=limit, offset=offset, q=q
    )
    items = [_employee_row_to_read(row) for row in rows]
    return EmployeeListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/employees/me/schedules", response_model=list[WeeklyScheduleRead])
async def list_my_weekly_schedules_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> list[WeeklyScheduleRead]:
    rows = await list_weekly_schedules_for_authenticated_user(db, user_id=current_user.id)
    return [WeeklyScheduleRead.model_validate(r) for r in rows]


@router.get("/employees/me/leave-balance", response_model=VacationLeaveBalanceRead)
async def get_my_leave_balance_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> VacationLeaveBalanceRead:
    """Self-service vacation balance (no ``employees:read``)."""
    employee_profile_id = await get_employee_profile_id_for_user(db, current_user.id)
    if employee_profile_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No employee profile linked to this account",
        )
    return await get_vacation_leave_balance(db, employee_profile_id=employee_profile_id)


@router.post(
    "/employees/me/leave-requests",
    response_model=LeaveRequestRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_my_leave_request_endpoint(
    body: LeaveRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*STAFF_SELF_SERVICE_ANY),
) -> LeaveRequestRead:
    """Submit a leave request for the signed-in employee (no ``employees:create``)."""
    employee_profile_id = await get_employee_profile_id_for_user(db, current_user.id)
    if employee_profile_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No employee profile linked to this account",
        )
    return await _finalize_created_leave_request(
        db,
        request=request,
        current_user=current_user,
        employee_profile_id=employee_profile_id,
        body=body,
    )


@router.get("/employees/{employee_profile_id}", response_model=EmployeeProfileRead)
async def get_employee_profile_endpoint(
    employee_profile_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
) -> EmployeeProfileRead:
    row = await get_employee_profile_enriched(db, employee_profile_id)
    employee = row["employee"]
    data = EmployeeProfileRead.model_validate(employee).model_dump()
    data.update(
        {
            "user_email": row["user_email"],
            "user_first_name": row["user_first_name"],
            "user_father_name": row["user_father_name"],
            "user_family_name": row["user_family_name"],
            "user_full_name": row["user_full_name"],
            "user_status": row["user_status"],
            "user_branch_id": row["user_branch_id"],
            "user_branch_name": row["user_branch_name"],
            "user_role_code": row["user_role_code"],
            "user_role_name": row["user_role_name"],
        }
    )
    return EmployeeProfileRead.model_validate(data)


@router.get(
    "/employees/{employee_profile_id}/leave-balance",
    response_model=VacationLeaveBalanceRead,
)
async def get_employee_leave_balance_endpoint(
    employee_profile_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
) -> VacationLeaveBalanceRead:
    return await get_vacation_leave_balance(db, employee_profile_id=employee_profile_id)


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
    row = await get_employee_profile_enriched(db, employee_profile_id)
    employee = row["employee"]
    data = EmployeeProfileRead.model_validate(employee).model_dump()
    data.update(
        {
            "user_email": row["user_email"],
            "user_first_name": row["user_first_name"],
            "user_father_name": row["user_father_name"],
            "user_family_name": row["user_family_name"],
            "user_full_name": row["user_full_name"],
            "user_status": row["user_status"],
            "user_branch_id": row["user_branch_id"],
            "user_branch_name": row["user_branch_name"],
            "user_role_code": row["user_role_code"],
            "user_role_name": row["user_role_name"],
        }
    )
    return EmployeeProfileRead.model_validate(data)


@router.post(
    "/employees/{employee_profile_id}/identity-document-image",
    response_model=IdentityDocumentImageResponse,
)
async def upload_employee_identity_document_image(
    employee_profile_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "update"),
) -> IdentityDocumentImageResponse:
    """Upload a passport / national ID scan (JPEG, PNG, or WebP)."""
    raw = await file.read(settings.EMPLOYEE_IDENTITY_DOCUMENT_MAX_BYTES + 1)
    if len(raw) > settings.EMPLOYEE_IDENTITY_DOCUMENT_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Identity document file too large",
        )
    try:
        row = await save_employee_identity_document_image(
            db, employee_profile_id=employee_profile_id, file_body=raw
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc
    await db.commit()
    await db.refresh(row)
    url = row.identity_document_image_url or ""
    return IdentityDocumentImageResponse(image_url=url)


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


@router.delete(
    "/employees/{employee_profile_id}/schedules/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_schedule_endpoint(
    employee_profile_id: int,
    schedule_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("employees", "update"),
) -> None:
    old_value = await delete_weekly_schedule(
        db, employee_profile_id=employee_profile_id, schedule_id=schedule_id
    )
    await audit_service.log(
        session=db,
        action="weekly_schedule.deleted",
        resource_type="weekly_schedule",
        resource_id=str(schedule_id),
        old_value=old_value,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


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


@router.get("/attendance/logs", response_model=AttendanceLogListResponse)
async def list_attendance_logs_global(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
    branch_id: int | None = None,
    employee_profile_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    classification_status: str | None = None,
    attendance_category: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> AttendanceLogListResponse:
    lim, off = clamp_pagination(limit, offset, max_limit=50)
    rows, total = await list_attendance_logs_enriched_page(
        db,
        branch_id=branch_id,
        employee_profile_id=employee_profile_id,
        date_from=date_from,
        date_to=date_to,
        classification_status=classification_status,
        attendance_category=attendance_category,
        limit=lim,
        offset=off,
    )
    items = [AttendanceLogRead.model_validate(r) for r in rows]
    return AttendanceLogListResponse(items=items, total=total, limit=lim, offset=off)


@router.get("/attendance/summary", response_model=AttendanceSummaryRead)
async def attendance_summary_endpoint(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("employees", "read"),
    branch_id: int | None = None,
    employee_profile_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> AttendanceSummaryRead:
    data = await attendance_period_summary(
        db,
        branch_id=branch_id,
        employee_profile_id=employee_profile_id,
        date_from=date_from,
        date_to=date_to,
    )
    return AttendanceSummaryRead(
        by_status=data["by_status"],
        overtime_minutes_total=float(data["overtime_minutes_total"]),
        record_count=int(data["record_count"]),
        absent_days=int(data["absent_days"]),
    )


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
    return await _finalize_created_leave_request(
        db,
        request=request,
        current_user=current_user,
        employee_profile_id=employee_profile_id,
        body=body,
    )


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
    return await enrich_leave_request_reads(db, rows)


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
    return await enrich_leave_request_reads(db, rows)


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
    delivery_id: int | None = None
    if applied:
        await audit_service.log(
            session=db,
            action="leave_request.reviewed",
            resource_type="leave_request",
            resource_id=str(row.id),
            user_id=current_user.id,
            request=request,
        )
        ep = await db.get(EmployeeProfile, row.employee_profile_id)
        if ep is not None:
            approved = row.status == LeaveStatus.APPROVED
            leave_kind_ar = _leave_type_label_ar(row.leave_type)
            period = _leave_period_phrase(row.start_date, row.end_date)
            if approved:
                title = "تمت الموافقة على طلب إجازتك"
                body_txt = f"تمت الموافقة على طلب {leave_kind_ar} (رقم {row.id}) للفترة {period}."
            else:
                title = "تم رفض طلب إجازتك"
                body_txt = f"تم رفض طلب {leave_kind_ar} (رقم {row.id}) للفترة {period}."
            body_txt = _append_ref_note(body_txt, row.review_notes)
            delivery_id = await enqueue_direct_notification(
                db,
                user_id=ep.user_id,
                title=title,
                body=body_txt,
                template_kind="leave_request_review",
                idempotency_key=f"leave_req:{row.id}:{row.status.value}:{idem or 'noidem'}",
                data={"leave_request_id": row.id, "path": "/hr/leave"},
                provider_name=None,
                default_push_provider=settings.PUSH_PROVIDER,
            )
    reads = await enrich_leave_request_reads(db, [row])
    await db.commit()
    if delivery_id is not None:
        await dispatch_delivery_after_commit(
            delivery_id, default_push_provider=settings.PUSH_PROVIDER
        )
    return reads[0]


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
