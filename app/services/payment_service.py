"""Provider-agnostic payment intent and capture service."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import NotFoundError, ValidationError
from app.models.currency import Currency
from app.models.pos_cart import PosCart
from app.models.pos_payment import PaymentAttempt, PaymentIntent, PaymentReceipt
from app.services.accounting_service import get_accounting_settings
from app.services.payments.providers.base import PaymentProvider
from app.services.payments.providers.in_store import InStoreLedgerProvider
from app.services.payments.providers.mock import MockPaymentProvider
from app.utils.money import q2

_FX_QUANT = Decimal("0.00000001")


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
    if cart.status != "checkout_locked":
        raise ValidationError(
            "Cart must be checkout_locked before creating a payment intent",
            details={"status": cart.status},
        )
    code = currency.strip().upper()
    cur_res = await db.execute(select(Currency).where(Currency.code == code))
    currency = cur_res.scalar_one_or_none()
    if currency is None:
        raise ValidationError("Unknown currency code", details={"currency": code})

    settings_row = await get_accounting_settings(db)
    if currency.id == settings_row.base_currency_id:
        snapshot = Decimal("1")
    else:
        raw = currency.exchange_rate_to_base
        if raw is None or raw <= 0:
            raise ValidationError(
                "No exchange rate configured for currency",
                details={"currency": code},
            )
        snapshot = raw.quantize(_FX_QUANT, rounding=ROUND_HALF_UP)

    selected_provider = (provider_name or settings.POS_DEFAULT_PAYMENT_PROVIDER).lower()
    provider = get_provider(selected_provider)
    amount = q2(cart.total)
    created = await provider.create_intent(amount=amount, currency=code)
    intent = PaymentIntent(
        cart_id=cart.id,
        provider=provider.name,
        amount=amount,
        currency=code,
        exchange_rate=snapshot,
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
    # Epic 21.6: Add transfer tender method
    if method not in {"cash", "card", "transfer", "other"}:
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
                provider_payload={"external_id": intent.external_id, "provider": intent.provider},
            )
        )
    await db.commit()
    await db.refresh(intent)
    return intent
