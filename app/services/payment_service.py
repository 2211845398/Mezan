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
from app.models.sales_invoice import SalesInvoice
from app.services.accounting_service import get_accounting_settings
from app.services.payments.providers.base import PaymentProvider
from app.services.payments.providers.in_store import InStoreLedgerProvider
from app.services.payments.providers.mock import MockPaymentProvider
from app.services.pos_customer_guard import assert_customer_active_for_pos
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

    amount = q2(cart.total)

    inv_row = await db.execute(select(SalesInvoice.id).where(SalesInvoice.cart_id == cart.id).limit(1))
    if inv_row.scalar_one_or_none() is None:
        succ_row = await db.execute(
            select(PaymentIntent).where(
                PaymentIntent.cart_id == cart.id,
                PaymentIntent.status == "succeeded",
            )
        )
        stuck = succ_row.scalar_one_or_none()
        if stuck is not None:
            if q2(stuck.amount) != amount:
                raise ValidationError(
                    "Cart total no longer matches the completed payment; unlock checkout and try again",
                    details={"cart_id": cart.id},
                )
            return stuck

    open_row = await db.execute(
        select(PaymentIntent).where(
            PaymentIntent.cart_id == cart.id,
            PaymentIntent.status.in_(("requires_capture", "requires_payment")),
        )
    )
    for stale in open_row.scalars().all():
        await db.delete(stale)
    await db.flush()

    selected_provider = (provider_name or settings.POS_DEFAULT_PAYMENT_PROVIDER).lower()
    provider = get_provider(selected_provider)
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
    cash_tendered: Decimal | None = None,
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
    if intent.status == "succeeded":
        return intent
    provider = get_provider(intent.provider)
    amount = q2(intent.amount)
    receipt_amount = amount
    if cash_tendered is not None:
        if method != "cash":
            raise ValidationError("cash_tendered is only valid for cash payments")
        ct = q2(cash_tendered)
        if ct <= Decimal("0"):
            raise ValidationError("cash_tendered must be greater than zero", details={"cash_tendered": str(ct)})
        if ct > amount:
            raise ValidationError(
                "cash_tendered cannot exceed payment intent amount",
                details={"cash_tendered": str(ct), "intent_amount": str(amount)},
            )
        receipt_amount = ct
        if ct < amount:
            c_res = await db.execute(select(PosCart).where(PosCart.id == intent.cart_id))
            cart_row = c_res.scalar_one_or_none()
            if not cart_row or cart_row.customer_id is None:
                raise ValidationError(
                    "Partial cash requires a customer on the cart to record the balance as receivable",
                    details={"cart_id": intent.cart_id},
                )
            await assert_customer_active_for_pos(db, cart_row.customer_id)
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
                amount=receipt_amount,
                method=method,
                reference=reference,
                card_last4=card_last4,
                provider_payload={"external_id": intent.external_id, "provider": intent.provider},
            )
        )
    await db.commit()
    await db.refresh(intent)
    return intent
