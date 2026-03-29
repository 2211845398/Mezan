"""POS payment APIs."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.epic3 import (
    PaymentCaptureRequest,
    PaymentIntentCreateRequest,
    PaymentIntentRead,
)
from app.services import audit_service
from app.services.payment_service import capture_payment, create_payment_intent

router = APIRouter()


@router.post(
    "/pos/payments/intents", response_model=PaymentIntentRead, status_code=status.HTTP_201_CREATED
)
async def create_payment_intent_endpoint(
    body: PaymentIntentCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_payments", "create"),
) -> PaymentIntentRead:
    intent = await create_payment_intent(
        db, cart_id=body.cart_id, provider_name=body.provider, currency=body.currency
    )
    await audit_service.log(
        session=db,
        action="payment_intent.created",
        resource_type="payment_intent",
        resource_id=str(intent.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PaymentIntentRead.model_validate(intent)


@router.post("/pos/payments/capture", response_model=PaymentIntentRead)
async def capture_payment_endpoint(
    body: PaymentCaptureRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_payments", "capture"),
) -> PaymentIntentRead:
    intent = await capture_payment(
        db,
        payment_intent_id=body.payment_intent_id,
        idempotency_key=body.idempotency_key,
        method=body.method,
        reference=body.reference,
    )
    await audit_service.log(
        session=db,
        action="payment_intent.captured",
        resource_type="payment_intent",
        resource_id=str(intent.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PaymentIntentRead.model_validate(intent)
