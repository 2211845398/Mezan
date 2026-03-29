"""Sales finalization APIs."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.epic3 import FinalizeInvoiceRequest, SalesInvoiceRead
from app.services import audit_service
from app.services.invoice_service import finalize_paid_cart

router = APIRouter()


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
