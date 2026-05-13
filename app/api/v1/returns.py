"""Returns and exchanges APIs."""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.sales_return import (
    ExchangeLinkDetailRead,
    SalesInvoiceReturnLookupRead,
    SalesReturnRequest,
)
from app.services import audit_service
from app.services.returns_service import (
    create_return_and_credit,
    get_exchange_link_detail,
    lookup_sales_invoice_for_return,
)

router = APIRouter()


@router.get("/pos/returns/invoice-lookup", response_model=SalesInvoiceReturnLookupRead)
async def lookup_return_invoice_endpoint(
    invoice_barcode: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("returns", "create"),
) -> SalesInvoiceReturnLookupRead:
    return await lookup_sales_invoice_for_return(db, invoice_barcode=invoice_barcode)


@router.get("/pos/returns/{return_id}/exchange-link", response_model=ExchangeLinkDetailRead)
async def get_return_exchange_link_endpoint(
    return_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("returns", "create"),
) -> ExchangeLinkDetailRead:
    return await get_exchange_link_detail(db, sales_return_id=return_id)


@router.post("/pos/returns", status_code=status.HTTP_201_CREATED)
async def create_return_endpoint(
    body: SalesReturnRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("returns", "create"),
) -> dict:
    sales_return, credit = await create_return_and_credit(
        db,
        invoice_barcode=body.invoice_barcode,
        lines=[x.model_dump() for x in body.lines],
        reason=body.reason,
        exchange_cart_id=body.exchange_cart_id,
        user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="sales_return.created",
        resource_type="sales_return",
        resource_id=str(sales_return.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return {
        "sales_return_id": sales_return.id,
        "credit_note_id": credit.id,
        "credit_number": credit.credit_number,
        "total_amount": str(credit.total_amount),
    }
