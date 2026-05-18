"""Sales finalization APIs."""

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.sales_invoice import (
    FinalizeInvoiceRequest,
    SalesInvoiceDetailRead,
    SalesInvoiceListItem,
    SalesInvoiceRead,
    SalesInvoiceRegisterPageRead,
    VoidInvoiceRequest,
)
from app.services import audit_service
from app.services.invoice_service import (
    finalize_paid_cart,
    list_sales_invoices_for_terminal_window,
    list_sales_invoices_register_page,
    read_sales_invoice_detail,
    void_sales_invoice,
)

router = APIRouter()


@router.get("/sales-invoices/register", response_model=SalesInvoiceRegisterPageRead)
async def list_sales_invoices_register_endpoint(
    branch_id: int = Query(..., description="Branch to list posted invoices for"),
    period_start: date = Query(..., description="First calendar day (UTC) inclusive"),
    period_end: date = Query(..., description="Last calendar day (UTC) inclusive"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _auth_user: User = Depends(get_current_user),
    _: None = require_permission("sales_invoices", "read"),
) -> SalesInvoiceRegisterPageRead:
    if period_end < period_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="period_end must be on or after period_start",
        )
    start_inclusive = datetime.combine(period_start, datetime.min.time()).replace(tzinfo=UTC)
    end_exclusive = datetime.combine(period_end + timedelta(days=1), datetime.min.time()).replace(
        tzinfo=UTC,
    )
    items, total_count, sum_subtotal, sum_total = await list_sales_invoices_register_page(
        db,
        branch_id=branch_id,
        start_inclusive=start_inclusive,
        end_exclusive=end_exclusive,
        limit=limit,
        offset=offset,
    )
    return SalesInvoiceRegisterPageRead(
        items=items,
        total_count=total_count,
        sum_subtotal=sum_subtotal,
        sum_total=sum_total,
    )


@router.get("/sales-invoices/{invoice_id}", response_model=SalesInvoiceDetailRead)
async def get_sales_invoice_endpoint(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("sales_invoices", "read"),
) -> SalesInvoiceDetailRead:
    return await read_sales_invoice_detail(db, invoice_id=invoice_id)


@router.get("/sales-invoices", response_model=list[SalesInvoiceListItem])
async def list_sales_invoices_endpoint(
    terminal_id: int = Query(..., description="POS terminal id"),
    business_date: date | None = Query(
        default=None,
        description="Calendar day in UTC for filtering (default: today UTC)",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("sales_invoices", "read"),
) -> list[SalesInvoiceListItem]:
    day = business_date or datetime.now(UTC).date()
    start_inclusive = datetime.combine(day, datetime.min.time()).replace(tzinfo=UTC)
    end_exclusive = start_inclusive + timedelta(days=1)
    return await list_sales_invoices_for_terminal_window(
        db,
        terminal_id=terminal_id,
        start_inclusive=start_inclusive,
        end_exclusive=end_exclusive,
    )


@router.post("/pos/sales/finalize", response_model=SalesInvoiceRead)
async def finalize_sale_endpoint(
    body: FinalizeInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("sales_invoices", "create"),
) -> SalesInvoiceRead:
    invoice = await finalize_paid_cart(
        db,
        cart_id=body.cart_id,
        payment_intent_id=body.payment_intent_id,
        idempotency_key=body.idempotency_key,
        user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="sales_invoice.created",
        resource_type="sales_invoice",
        resource_id=str(invoice.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return SalesInvoiceRead.model_validate(invoice)


@router.post("/pos/sales/void", response_model=SalesInvoiceRead)
async def void_sale_endpoint(
    body: VoidInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("sales_invoices", "void"),
) -> SalesInvoiceRead:
    invoice = await void_sales_invoice(
        db,
        invoice_id=body.invoice_id,
        invoice_barcode=body.invoice_barcode,
        reason=body.reason,
        actor_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="sales_invoice.voided",
        resource_type="sales_invoice",
        resource_id=str(invoice.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return SalesInvoiceRead.model_validate(invoice)
