"""POS payment APIs."""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.pos_payment import (
    CashRoundingConfigRead,
    PaymentCaptureRequest,
    PaymentIntentCreateRequest,
    PaymentIntentRead,
)
from app.services import audit_service
from app.services.payment_service import (
    capture_payment,
    create_payment_intent,
    get_cash_rounding_config,
)

router = APIRouter()


@router.get("/pos/payments/cash-rounding-config", response_model=CashRoundingConfigRead)
async def cash_rounding_config_endpoint(
    currency: str = Query(min_length=3, max_length=3),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("pos_payments", "create"),
) -> CashRoundingConfigRead:
    return await get_cash_rounding_config(db, currency=currency)


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
        db,
        cart_id=body.cart_id,
        provider_name=body.provider,
        currency=body.currency,
        payment_method=body.payment_method,
        cash_tendered=body.cash_tendered,
        exchange_credit_amount=body.exchange_credit_amount,
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
        card_last4=body.card_last4,
        cash_tendered=body.cash_tendered,
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
