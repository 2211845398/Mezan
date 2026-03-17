"""Invoice scan endpoints (Epic 2): OCR/QR ingestion + parsed payload retrieval."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.invoice_scans import (
    InvoiceScanCreate,
    InvoiceScanOverride,
    InvoiceScanRead,
    InvoiceScanValidateRequest,
    InvoiceScanValidateResponse,
)
from app.services import audit_service
from app.services.invoice_scan_service import (
    create_scan,
    get_scan,
    override_scan,
    validate_scan_and_receive_goods,
)

router = APIRouter()


@router.post("/invoice-scans", response_model=InvoiceScanRead, status_code=status.HTTP_201_CREATED)
async def create_invoice_scan_endpoint(
    body: InvoiceScanCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("invoice_scans", "create"),
) -> InvoiceScanRead:
    scan = await create_scan(db, source_type=body.source_type, data=body.data)
    await audit_service.log(
        session=db,
        action="invoice_scan.created",
        resource_type="invoice_scan",
        resource_id=str(scan.id),
        new_value=InvoiceScanRead.model_validate(scan).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return InvoiceScanRead.model_validate(scan)


@router.get("/invoice-scans/{scan_id}", response_model=InvoiceScanRead)
async def get_invoice_scan_endpoint(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("invoice_scans", "read"),
) -> InvoiceScanRead:
    scan = await get_scan(db, scan_id)
    return InvoiceScanRead.model_validate(scan)


@router.patch("/invoice-scans/{scan_id}/override", response_model=InvoiceScanRead)
async def override_invoice_scan_endpoint(
    scan_id: int,
    body: InvoiceScanOverride,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("invoice_scans", "update"),
) -> InvoiceScanRead:
    scan = await override_scan(db, scan_id=scan_id, override_output=body.override_output)
    await audit_service.log(
        session=db,
        action="invoice_scan.overridden",
        resource_type="invoice_scan",
        resource_id=str(scan.id),
        new_value=InvoiceScanRead.model_validate(scan).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return InvoiceScanRead.model_validate(scan)


@router.post("/invoice-scans/{scan_id}/validate", response_model=InvoiceScanValidateResponse)
async def validate_invoice_scan_endpoint(
    scan_id: int,
    body: InvoiceScanValidateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("invoice_scans", "validate"),
) -> InvoiceScanValidateResponse:
    scan, receipt = await validate_scan_and_receive_goods(
        db,
        scan_id=scan_id,
        branch_id=body.branch_id,
        created_by_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="invoice_scan.validated",
        resource_type="invoice_scan",
        resource_id=str(scan.id),
        new_value=InvoiceScanRead.model_validate(scan).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await audit_service.log(
        session=db,
        action="goods_receipt.created",
        resource_type="goods_receipt",
        resource_id=str(receipt.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return InvoiceScanValidateResponse(
        scan=InvoiceScanRead.model_validate(scan),
        goods_receipt_id=receipt.id,
    )
