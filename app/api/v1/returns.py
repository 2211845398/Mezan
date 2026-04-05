"""Returns and exchanges APIs."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.sales_return import SalesReturnRequest
from app.services import audit_service
from app.services.returns_service import create_return_and_credit

router = APIRouter()


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
        "total_amount": float(credit.total_amount),
    }
