"""Payroll APIs (Epic 4.3/4.4)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.payroll import PayslipApproveRequest, PayslipGenerateRequest, PayslipRead
from app.services import audit_service
from app.services.payroll_service import (
    approve_payslip,
    export_approved_payslips_csv,
    generate_payslip,
    get_payslip,
    list_payslips,
    recalculate_draft_payslip,
)

router = APIRouter()


def _idempotency_key(request: Request, body_key: str | None) -> str | None:
    h = request.headers.get("Idempotency-Key")
    if h and len(h.strip()) >= 8:
        return h.strip()
    return body_key


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
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "read"),
) -> list[PayslipRead]:
    rows = await list_payslips(db, status=status)
    return [PayslipRead.model_validate(r) for r in rows]


@router.get("/payroll/payslips/{payslip_id}", response_model=PayslipRead)
async def get_payslip_endpoint(
    payslip_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("payroll", "read"),
) -> PayslipRead:
    row = await get_payslip(db, payslip_id)
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
