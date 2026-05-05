"""Payroll APIs (Epic 4.3/4.4) + SRS overview, policies, and payout."""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.config import settings
from app.db.database import get_db
from app.models.employee_profile import EmployeeProfile
from app.models.users import User
from app.schemas.payroll import (
    AttendancePayrollPolicyRead,
    AttendancePayrollPolicyUpsert,
    PayrollApproveAndPayRequest,
    PayrollIdempotencyBody,
    PayrollOverviewRow,
    PayrollPeriodPrepareFailure,
    PayrollPeriodPrepareResult,
    PayrollPeriodRead,
    PayrollPeriodSummary,
    PayslipAdjustmentsPatch,
    PayslipApproveRequest,
    PayslipGenerateRequest,
    PayslipRead,
)
from app.services import audit_service
from app.services.attendance_policy_service import list_policies, upsert_policy
from app.services.notifications.service import (
    dispatch_delivery_after_commit,
    enqueue_direct_notification,
)
from app.services.payroll_pdf_service import build_payroll_period_pdf
from app.services.payroll_service import (
    approve_and_pay_period,
    approve_payslip,
    calendar_month_period_bounds,
    export_approved_payslips_csv,
    generate_payslip,
    get_payroll_period_snapshot,
    get_payslip,
    list_payroll_overview,
    list_payslips_read,
    mark_payslips_paid_for_period,
    prepare_payroll_period_drafts,
    recalculate_draft_payslip,
    update_draft_payslip_adjustments,
)

router = APIRouter()


def _idempotency_key(request: Request, body_key: str | None) -> str | None:
    h = request.headers.get("Idempotency-Key")
    if h and len(h.strip()) >= 8:
        return h.strip()
    return body_key


def _validate_payroll_year_month(year: int, month: int) -> None:
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="year out of range")
    if month < 1 or month > 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="month out of range")


def _payroll_period_read_from_snapshot(snap: dict) -> PayrollPeriodRead:
    return PayrollPeriodRead(
        year=snap["year"],
        month=snap["month"],
        period_start=snap["period_start"],
        period_end=snap["period_end"],
        approval_opens_on=snap["approval_opens_on"],
        is_approval_open=snap["is_approval_open"],
        summary=PayrollPeriodSummary.model_validate(snap["summary"]),
        rows=[PayrollOverviewRow.model_validate(r) for r in snap["rows"]],
    )


@router.post(
    "/payroll/payslips/generate", response_model=PayslipRead, status_code=status.HTTP_201_CREATED
)
async def generate_payslip_endpoint(
    body: PayslipGenerateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "create"),
) -> PayslipRead:
    idem = _idempotency_key(request, body.idempotency_key)
    payslip, created = await generate_payslip(
        db,
        employee_profile_id=body.employee_profile_id,
        period_start=body.period_start,
        period_end=body.period_end,
        deductions=body.deductions,
        hourly_rate_override=body.hourly_rate_override,
        bonus_amount=body.bonus_amount,
        idempotency_key=idem,
    )
    if created:
        await audit_service.log(
            session=db,
            action="payslip.generated",
            resource_type="payslip",
            resource_id=str(payslip.id),
            user_id=current_user.id,
            request=request,
        )
    await db.commit()
    return PayslipRead.model_validate(payslip)


@router.get("/payroll/payslips", response_model=list[PayslipRead])
async def list_payslips_endpoint(
    status: str | None = None,
    period_start: date | None = Query(None),
    period_end: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "read"),
) -> list[PayslipRead]:
    if (period_start is None) ^ (period_end is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="period_start and period_end must be provided together",
        )
    return await list_payslips_read(
        db,
        status=status,
        period_start=period_start,
        period_end=period_end,
    )


@router.get("/payroll/payslips/{payslip_id}", response_model=PayslipRead)
async def get_payslip_endpoint(
    payslip_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "read"),
) -> PayslipRead:
    row = await get_payslip(db, payslip_id)
    return PayslipRead.model_validate(row)


@router.patch("/payroll/payslips/{payslip_id}/adjustments", response_model=PayslipRead)
async def patch_payslip_adjustments_endpoint(
    payslip_id: int,
    body: PayslipAdjustmentsPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "create"),
) -> PayslipRead:
    row = await update_draft_payslip_adjustments(
        db,
        payslip_id=payslip_id,
        bonus_amount=body.bonus_amount,
        manual_deductions=body.manual_deductions,
    )
    await audit_service.log(
        session=db,
        action="payslip.adjustments_updated",
        resource_type="payslip",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PayslipRead.model_validate(row)


@router.post("/payroll/payslips/{payslip_id}/recalculate", response_model=PayslipRead)
async def recalculate_payslip_endpoint(
    payslip_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "create"),
) -> PayslipRead:
    row = await recalculate_draft_payslip(db, payslip_id=payslip_id)
    await audit_service.log(
        session=db,
        action="payslip.recalculated",
        resource_type="payslip",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PayslipRead.model_validate(row)


@router.post("/payroll/payslips/approve", response_model=PayslipRead)
async def approve_payslip_endpoint(
    body: PayslipApproveRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "approve"),
) -> PayslipRead:
    idem = _idempotency_key(request, body.idempotency_key)
    row, applied = await approve_payslip(
        db, payslip_id=body.payslip_id, approver_user_id=current_user.id, idempotency_key=idem
    )
    if applied:
        await audit_service.log(
            session=db,
            action="payslip.approved",
            resource_type="payslip",
            resource_id=str(row.id),
            user_id=current_user.id,
            request=request,
        )
    await db.commit()
    return PayslipRead.model_validate(row)


@router.get("/payroll/overview", response_model=list[PayrollOverviewRow])
async def payroll_overview_endpoint(
    period_start: date,
    period_end: date,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "read"),
) -> list[PayrollOverviewRow]:
    rows = await list_payroll_overview(db, period_start=period_start, period_end=period_end)
    return [PayrollOverviewRow.model_validate(r) for r in rows]


@router.get("/payroll/periods/current", response_model=PayrollPeriodRead)
async def payroll_period_current_endpoint(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "read"),
) -> PayrollPeriodRead:
    today = datetime.now(UTC).date()
    snap = await get_payroll_period_snapshot(db, year=today.year, month=today.month)
    return _payroll_period_read_from_snapshot(snap)


@router.get("/payroll/periods/{year}/{month}", response_model=PayrollPeriodRead)
async def payroll_period_get_endpoint(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "read"),
) -> PayrollPeriodRead:
    _validate_payroll_year_month(year, month)
    snap = await get_payroll_period_snapshot(db, year=year, month=month)
    return _payroll_period_read_from_snapshot(snap)


@router.post(
    "/payroll/periods/{year}/{month}/prepare",
    response_model=PayrollPeriodPrepareResult,
    status_code=status.HTTP_200_OK,
)
async def payroll_period_prepare_endpoint(
    year: int,
    month: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "create"),
) -> PayrollPeriodPrepareResult:
    _validate_payroll_year_month(year, month)
    result = await prepare_payroll_period_drafts(db, year=year, month=month)
    await audit_service.log(
        session=db,
        action="payroll.period_prepared",
        resource_type="payroll",
        resource_id=f"{year}-{month:02d}",
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PayrollPeriodPrepareResult(
        year=result["year"],
        month=result["month"],
        period_start=result["period_start"],
        period_end=result["period_end"],
        created_count=result["created_count"],
        skipped_existing_count=result["skipped_existing_count"],
        skipped_inactive_count=result["skipped_inactive_count"],
        failures=[PayrollPeriodPrepareFailure.model_validate(f) for f in result["failures"]],
    )


@router.post("/payroll/periods/{year}/{month}/approve-and-pay", response_model=list[PayslipRead])
async def payroll_period_approve_and_pay_endpoint(
    year: int,
    month: int,
    body: PayrollIdempotencyBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "approve"),
) -> list[PayslipRead]:
    _validate_payroll_year_month(year, month)
    idem = _idempotency_key(request, body.idempotency_key)
    if not idem:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header or idempotency_key body (min 8 chars) is required",
        )
    period_start, period_end = calendar_month_period_bounds(year, month)
    _approved, paid = await approve_and_pay_period(
        db,
        period_start=period_start,
        period_end=period_end,
        approver_user_id=current_user.id,
        idempotency_key=idem,
    )
    await audit_service.log(
        session=db,
        action="payroll.approve_and_pay",
        resource_type="payroll",
        resource_id=f"{period_start}:{period_end}",
        user_id=current_user.id,
        request=request,
    )
    delivery_ids: list[int] = []
    month_label = period_start.strftime("%B %Y")
    for p in paid:
        res = await db.execute(
            select(EmployeeProfile.user_id).where(EmployeeProfile.id == p.employee_profile_id)
        )
        uid = res.scalar_one_or_none()
        if uid is None:
            continue
        nid = await enqueue_direct_notification(
            db,
            user_id=uid,
            title="Salary deposited",
            body=f"Your salary for {month_label} has been deposited (payslip #{p.id}).",
            template_kind="payslip_paid",
            idempotency_key=f"{idem}:approvepay:notify:{p.id}",
            data={"payslip_id": p.id, "path": "/payroll/runs"},
            provider_name=None,
            default_push_provider=settings.PUSH_PROVIDER,
        )
        if nid:
            delivery_ids.append(nid)
    await db.commit()
    for nid in delivery_ids:
        await dispatch_delivery_after_commit(nid, default_push_provider=settings.PUSH_PROVIDER)
    return [PayslipRead.model_validate(r) for r in paid]


@router.get("/payroll/periods/{year}/{month}/export.pdf")
async def payroll_period_export_pdf_endpoint(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "export"),
) -> Response:
    _validate_payroll_year_month(year, month)
    period_start, period_end = calendar_month_period_bounds(year, month)
    rows = await list_payroll_overview(db, period_start=period_start, period_end=period_end)
    pdf_bytes = build_payroll_period_pdf(
        period_start=period_start,
        period_end=period_end,
        rows=rows,
        title=f"Payroll {year}-{month:02d}",
    )
    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="payroll-{year}-{month:02d}.pdf"',
        },
    )


@router.post("/payroll/payout/mark-paid", response_model=list[PayslipRead])
async def mark_paid_endpoint(
    body: PayrollApproveAndPayRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "approve"),
) -> list[PayslipRead]:
    """Mark approved payslips in the period as paid and notify employees."""
    idem = _idempotency_key(request, body.idempotency_key)
    if not idem:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header or idempotency_key body (min 8 chars) is required",
        )
    paid = await mark_payslips_paid_for_period(
        db,
        period_start=body.period_start,
        period_end=body.period_end,
        actor_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="payslip.payout_marked",
        resource_type="payroll",
        resource_id=f"{body.period_start}:{body.period_end}",
        user_id=current_user.id,
        request=request,
    )
    delivery_ids: list[int] = []
    for p in paid:
        res = await db.execute(
            select(EmployeeProfile.user_id).where(EmployeeProfile.id == p.employee_profile_id)
        )
        uid = res.scalar_one_or_none()
        if uid is None:
            continue
        nid = await enqueue_direct_notification(
            db,
            user_id=uid,
            title="Salary deposited",
            body=f"Your salary for {p.period_start.strftime('%B %Y')} has been deposited (payslip #{p.id}).",
            template_kind="payslip_paid",
            idempotency_key=f"{idem}:paid:notify:{p.id}",
            data={"payslip_id": p.id, "path": "/payroll/runs"},
            provider_name=None,
            default_push_provider=settings.PUSH_PROVIDER,
        )
        if nid:
            delivery_ids.append(nid)
    await db.commit()
    for nid in delivery_ids:
        await dispatch_delivery_after_commit(nid, default_push_provider=settings.PUSH_PROVIDER)
    return [PayslipRead.model_validate(r) for r in paid]


@router.post("/payroll/approve-and-pay", response_model=list[PayslipRead])
async def approve_and_pay_endpoint(
    body: PayrollApproveAndPayRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "approve"),
) -> list[PayslipRead]:
    idem = _idempotency_key(request, body.idempotency_key)
    if not idem:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header or idempotency_key body (min 8 chars) is required",
        )
    approved, paid = await approve_and_pay_period(
        db,
        period_start=body.period_start,
        period_end=body.period_end,
        approver_user_id=current_user.id,
        idempotency_key=idem,
    )
    await audit_service.log(
        session=db,
        action="payroll.approve_and_pay",
        resource_type="payroll",
        resource_id=f"{body.period_start}:{body.period_end}",
        user_id=current_user.id,
        request=request,
    )
    delivery_ids: list[int] = []
    for p in paid:
        res = await db.execute(
            select(EmployeeProfile.user_id).where(EmployeeProfile.id == p.employee_profile_id)
        )
        uid = res.scalar_one_or_none()
        if uid is None:
            continue
        month_label = p.period_start.strftime("%B %Y")
        nid = await enqueue_direct_notification(
            db,
            user_id=uid,
            title="Salary deposited",
            body=f"Your salary for {month_label} has been deposited (payslip #{p.id}).",
            template_kind="payslip_paid",
            idempotency_key=f"{idem}:approvepay:notify:{p.id}",
            data={"payslip_id": p.id, "path": "/payroll/runs"},
            provider_name=None,
            default_push_provider=settings.PUSH_PROVIDER,
        )
        if nid:
            delivery_ids.append(nid)
    await db.commit()
    for nid in delivery_ids:
        await dispatch_delivery_after_commit(nid, default_push_provider=settings.PUSH_PROVIDER)
    _ = approved
    return [PayslipRead.model_validate(r) for r in paid]


@router.get(
    "/payroll/policies/attendance-deductions", response_model=list[AttendancePayrollPolicyRead]
)
async def list_attendance_policies_endpoint(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "read"),
) -> list[AttendancePayrollPolicyRead]:
    rows = await list_policies(db)
    return [AttendancePayrollPolicyRead.model_validate(r) for r in rows]


@router.put(
    "/payroll/policies/attendance-deductions/{role_code}",
    response_model=AttendancePayrollPolicyRead,
)
async def upsert_attendance_policy_endpoint(
    role_code: str,
    body: AttendancePayrollPolicyUpsert,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("payroll", "create"),
) -> AttendancePayrollPolicyRead:
    row = await upsert_policy(
        db,
        role_code=role_code,
        attendance_category=body.attendance_category,
        grace_minutes=body.grace_minutes,
        absence_deduction_amount=body.absence_deduction_amount,
        late_deduction_amount=body.late_deduction_amount,
        early_close_deduction_amount=body.early_close_deduction_amount,
        overtime_multiplier=body.overtime_multiplier,
        is_active=body.is_active,
    )
    await audit_service.log(
        session=db,
        action="payroll.attendance_policy.upserted",
        resource_type="attendance_payroll_policy",
        resource_id=role_code,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return AttendancePayrollPolicyRead.model_validate(row)


@router.get("/payroll/export")
async def export_payroll_csv_endpoint(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "export"),
) -> StreamingResponse:
    csv_payload = await export_approved_payslips_csv(db)
    return StreamingResponse(
        iter([csv_payload]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="approved_payslips.csv"'},
    )
