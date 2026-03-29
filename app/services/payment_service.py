"""Provider-agnostic payment intent and capture service."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.pos_cart import PosCart
from app.models.pos_payment import PaymentAttempt, PaymentIntent, PaymentReceipt
from app.services.payments.providers.base import PaymentProvider
from app.services.payments.providers.mock import MockPaymentProvider


def get_provider(provider_name: str) -> PaymentProvider:
    if provider_name == "mock":
        return MockPaymentProvider()
    raise ValidationError("Unsupported payment provider", details={"provider": provider_name})


async def create_payment_intent(
    db: AsyncSession, *, cart_id: int, provider_name: str, currency: str
) -> PaymentIntent:
    c_res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = c_res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if cart.status not in {"active", "checkout_locked"}:
        raise ValidationError("Cart cannot be paid in current status")
    provider = get_provider(provider_name)
    created = await provider.create_intent(amount=float(cart.total), currency=currency)
    intent = PaymentIntent(
        cart_id=cart.id,
        provider=provider.name,
        amount=float(cart.total),
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
) -> PaymentIntent:
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
    result = await provider.capture(
        external_id=intent.external_id or "",
        amount=float(intent.amount),
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
                amount=float(intent.amount),
                method=method,
                reference=reference,
                redacted_payload={"external_id": intent.external_id, "provider": intent.provider},
            )
        )
    await db.commit()
    await db.refresh(intent)
    return intent
