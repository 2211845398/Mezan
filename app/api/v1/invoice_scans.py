"""Invoice scan endpoints (Epic 2): OCR/QR ingestion + parsed payload retrieval."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.invoice_scan import InvoiceScan
from app.models.users import User
from app.schemas.invoice_scans import (
    InvoiceScanApplyCatalogMatchesRequest,
    InvoiceScanListResponse,
    InvoiceScanCreate,
    InvoiceScanOverride,
    InvoiceScanRead,
    InvoiceScanValidateRequest,
    InvoiceScanValidateResponse,
)
from app.services import audit_service
from app.services.invoice_scan_service import (
    apply_catalog_matches,
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
    scan = await create_scan(
        db,
        source_type=body.source_type,
        data=body.data,
        provider_name=body.provider,
    )
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


@router.get("/invoice-scans", response_model=InvoiceScanListResponse)
async def list_invoice_scans_endpoint(
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("invoice_scans", "read"),
) -> InvoiceScanListResponse:
    """Paginated list of invoice scans (OCR runs), optional status filter."""
    from app.schemas.pagination import clamp_pagination

    limit, offset = clamp_pagination(limit, offset)
    count_stmt = select(func.count()).select_from(InvoiceScan)
    if status is not None:
        count_stmt = count_stmt.where(InvoiceScan.status == status)
    total = int(await db.scalar(count_stmt) or 0)
    q = select(InvoiceScan).order_by(InvoiceScan.id.desc())
    if status is not None:
        q = q.where(InvoiceScan.status == status)
    q = q.limit(limit).offset(offset)
    res = await db.execute(q)
    rows = res.scalars().all()
    items = [InvoiceScanRead.model_validate(r) for r in rows]
    return InvoiceScanListResponse(items=items, total=total, limit=limit, offset=offset)


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


@router.post("/invoice-scans/{scan_id}/apply-catalog-matches", response_model=InvoiceScanRead)
async def apply_catalog_matches_endpoint(
    scan_id: int,
    body: InvoiceScanApplyCatalogMatchesRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("invoice_scans", "validate"),
) -> InvoiceScanRead:
    pre = await get_scan(db, scan_id)
    if pre.catalog_match_apply_idempotency_key == body.idempotency_key:
        return InvoiceScanRead.model_validate(pre)
    scan = await apply_catalog_matches(
        db,
        scan_id=scan_id,
        idempotency_key=body.idempotency_key,
        line_matches=[m.model_dump() for m in body.line_matches],
    )
    await audit_service.log(
        session=db,
        action="invoice_scan.catalog_matches_applied",
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
