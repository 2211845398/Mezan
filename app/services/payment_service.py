"""Provider-agnostic payment intent and capture service."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import NotFoundError, ValidationError
from app.models.pos_cart import PosCart
from app.models.pos_payment import PaymentAttempt, PaymentIntent, PaymentReceipt
from app.services.payments.providers.base import PaymentProvider
from app.services.payments.providers.in_store import InStoreLedgerProvider
from app.services.payments.providers.mock import MockPaymentProvider
from app.utils.money import q2


def get_provider(provider_name: str) -> PaymentProvider:
    if provider_name == "in_store":
        return InStoreLedgerProvider()
    if provider_name == "mock":
        return MockPaymentProvider()
    raise ValidationError("Unsupported payment provider", details={"provider": provider_name})


async def create_payment_intent(
    db: AsyncSession, *, cart_id: int, provider_name: str | None, currency: str
) -> PaymentIntent:
    c_res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = c_res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if cart.status not in {"active", "checkout_locked"}:
        raise ValidationError("Cart cannot be paid in current status")
    selected_provider = (provider_name or settings.POS_DEFAULT_PAYMENT_PROVIDER).lower()
    provider = get_provider(selected_provider)
    amount = q2(cart.total)
    created = await provider.create_intent(amount=amount, currency=currency)
    intent = PaymentIntent(
        cart_id=cart.id,
        provider=provider.name,
        amount=amount,
        currency=currency,
        status=created.status,
        external_id=created.external_id,
    )
    db.add(intent)
    await db.commit()
    await db.refresh(intent)
    return intent


async def capture_payment(
    db: AsyncSession,
    *,
    payment_intent_id: int,
    idempotency_key: str,
    method: str,
    reference: str | None,
    card_last4: str | None,
) -> PaymentIntent:
    if method not in {"cash", "card", "other"}:
        raise ValidationError("Unsupported payment method", details={"method": method})
    if method == "card" and not card_last4:
        raise ValidationError("card_last4 is required for card payments")
    if method != "card" and card_last4:
        raise ValidationError("card_last4 is only allowed for card payments")

    existing = await db.execute(
        select(PaymentAttempt).where(PaymentAttempt.idempotency_key == idempotency_key)
    )
    if existing.scalar_one_or_none():
        res = await db.execute(select(PaymentIntent).where(PaymentIntent.id == payment_intent_id))
        current = res.scalar_one_or_none()
        if not current:
            raise NotFoundError("Payment intent not found")
        return current

    res = await db.execute(select(PaymentIntent).where(PaymentIntent.id == payment_intent_id))
    intent = res.scalar_one_or_none()
    if not intent:
        raise NotFoundError("Payment intent not found")
    provider = get_provider(intent.provider)
    amount = q2(intent.amount)
    result = await provider.capture(
        external_id=intent.external_id or "",
        amount=amount,
        idempotency_key=idempotency_key,
    )
    intent.status = result.status
    db.add(
        PaymentAttempt(
            payment_intent_id=intent.id,
            idempotency_key=idempotency_key,
            status=result.status,
            provider_payload=result.payload,
        )
    )
    if result.status == "succeeded":
        db.add(
            PaymentReceipt(
                payment_intent_id=intent.id,
                amount=amount,
                method=method,
                reference=reference,
                card_last4=card_last4,
                redacted_payload={"external_id": intent.external_id, "provider": intent.provider},
            )
        )
    await db.commit()
    await db.refresh(intent)
    return intent
