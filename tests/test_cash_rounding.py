"""POS cash rounding: utility, payment intent, invoice fields, and GL."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.branch import Branch
from app.models.category import Category
from app.models.chart_accounts import ChartAccount
from app.models.currency import Currency
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.pos_cart import PosCart, PosCartLine
from app.models.pos_payment import PaymentIntent, PaymentReceipt
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_level import StockLevel
from app.models.users import User
from app.services import invoice_service, payment_service
from app.services.accounting_service import get_accounting_settings
from app.services.seed_service import seed_accounting_defaults
from app.utils.cash_rounding import round_cash_total


def test_round_cash_total_to_nearest_nickel() -> None:
    rounded, diff = round_cash_total(Decimal("43.92"), Decimal("0.05"))
    assert rounded == Decimal("43.90")
    assert diff == Decimal("-0.02")

    rounded2, diff2 = round_cash_total(Decimal("43.88"), Decimal("0.05"))
    assert rounded2 == Decimal("43.90")
    assert diff2 == Decimal("0.02")

    rounded3, diff3 = round_cash_total(Decimal("10.00"), Decimal("0.05"))
    assert rounded3 == Decimal("10.00")
    assert diff3 == Decimal("0.00")


def test_round_cash_total_disabled_when_increment_missing() -> None:
    rounded, diff = round_cash_total(Decimal("43.92"), None)
    assert rounded == Decimal("43.92")
    assert diff == Decimal("0.00")


async def _ensure_accounting(db_session) -> None:
    await seed_accounting_defaults(db_session)


@pytest.mark.asyncio
async def test_seed_accounting_defaults_backfills_rounding_account(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await get_accounting_settings(db_session)
    settings.default_rounding_difference_account_id = None
    await db_session.commit()

    await seed_accounting_defaults(db_session)
    await db_session.refresh(settings)

    assert settings.default_rounding_difference_account_id is not None
    acct = await db_session.get(ChartAccount, settings.default_rounding_difference_account_id)
    assert acct is not None
    assert acct.code == "6080"


class _MockInStoreProvider:
    name = "in_store"

    async def create_intent(self, **kwargs):
        class _R:
            status = "requires_capture"
            external_id = "ext"

        return _R()


@pytest.mark.asyncio
async def test_cash_payment_intent_uses_rounded_amount(db_session, monkeypatch) -> None:
    await _ensure_accounting(db_session)
    usd = (await db_session.execute(select(Currency).where(Currency.code == "USD"))).scalar_one()
    usd.cash_rounding_increment = Decimal("0.05")
    await db_session.flush()

    _branch, _user, _category, _product, _terminal, cart, _pv = await _seed_locked_cart(
        db_session, total=Decimal("43.92")
    )

    monkeypatch.setattr(payment_service, "get_provider", lambda _name: _MockInStoreProvider())

    intent = await payment_service.create_payment_intent(
        db_session,
        cart_id=cart.id,
        provider_name="in_store",
        currency="USD",
        payment_method="cash",
    )
    assert intent.amount == Decimal("43.90")


@pytest.mark.asyncio
async def test_card_payment_intent_keeps_exact_total(db_session, monkeypatch) -> None:
    await _ensure_accounting(db_session)
    usd = (await db_session.execute(select(Currency).where(Currency.code == "USD"))).scalar_one()
    usd.cash_rounding_increment = Decimal("0.05")
    await db_session.flush()

    _branch, _user, _category, _product, _terminal, cart, _pv = await _seed_locked_cart(
        db_session, total=Decimal("43.92")
    )

    monkeypatch.setattr(payment_service, "get_provider", lambda _name: _MockInStoreProvider())

    intent = await payment_service.create_payment_intent(
        db_session,
        cart_id=cart.id,
        provider_name="in_store",
        currency="USD",
        payment_method="card",
    )
    assert intent.amount == Decimal("43.92")


@pytest.mark.asyncio
async def test_partial_cash_skips_rounding_on_intent(db_session, monkeypatch) -> None:
    await _ensure_accounting(db_session)
    usd = (await db_session.execute(select(Currency).where(Currency.code == "USD"))).scalar_one()
    usd.cash_rounding_increment = Decimal("0.05")
    await db_session.flush()

    _branch, _user, _category, _product, _terminal, cart, _pv = await _seed_locked_cart(
        db_session, total=Decimal("43.92")
    )

    monkeypatch.setattr(payment_service, "get_provider", lambda _name: _MockInStoreProvider())

    intent = await payment_service.create_payment_intent(
        db_session,
        cart_id=cart.id,
        provider_name="in_store",
        currency="USD",
        payment_method="cash",
        cash_tendered=Decimal("20.00"),
    )
    assert intent.amount == Decimal("43.92")


@pytest.mark.asyncio
async def test_finalize_persists_amount_paid_and_rounding(db_session, monkeypatch) -> None:
    await _ensure_accounting(db_session)
    settings = await get_accounting_settings(db_session)
    assert settings.default_rounding_difference_account_id is not None

    usd = (await db_session.execute(select(Currency).where(Currency.code == "USD"))).scalar_one()
    usd.cash_rounding_increment = Decimal("0.05")
    await db_session.flush()

    _branch, user, _category, product, terminal, cart, pv = await _seed_locked_cart(
        db_session, total=Decimal("43.92")
    )

    intent = PaymentIntent(
        cart_id=cart.id,
        provider="in_store",
        amount=Decimal("43.90"),
        currency="USD",
        exchange_rate=Decimal("1"),
        status="succeeded",
        external_id="x",
    )
    db_session.add(intent)
    await db_session.flush()
    db_session.add(
        PaymentReceipt(
            payment_intent_id=intent.id,
            amount=Decimal("43.90"),
            method="cash",
            reference=None,
            card_last4=None,
            provider_payload={},
        )
    )
    await db_session.commit()

    invoice = await invoice_service.finalize_paid_cart(
        db_session,
        cart_id=cart.id,
        payment_intent_id=intent.id,
        idempotency_key=f"idem-{uuid.uuid4().hex}",
        user_id=user.id,
    )
    assert invoice.total == Decimal("43.92")
    assert invoice.amount_paid == Decimal("43.90")
    assert invoice.rounding_difference == Decimal("-0.02")

    entries = (
        (
            await db_session.execute(
                select(JournalEntry).where(
                    JournalEntry.source_type == "sales_invoice",
                    JournalEntry.source_id == str(invoice.id),
                )
            )
        )
        .scalars()
        .all()
    )
    assert entries
    all_lines: list[JournalEntryLine] = []
    for je in entries:
        all_lines.extend(
            (
                await db_session.execute(
                    select(JournalEntryLine).where(JournalEntryLine.journal_entry_id == je.id)
                )
            )
            .scalars()
            .all()
        )
    debits = sum(ln.debit for ln in all_lines)
    credits = sum(ln.credit for ln in all_lines)
    assert debits == credits
    rounding_lines = [
        ln for ln in all_lines if ln.account_id == settings.default_rounding_difference_account_id
    ]
    assert len(rounding_lines) == 1
    assert rounding_lines[0].debit == Decimal("0.02")


async def _seed_locked_cart(db_session, *, total: Decimal):
    branch = Branch(
        name="Rounding Store",
        code=f"RS-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"rnd-{uuid.uuid4().hex[:8]}@example.com",
        first_name="R",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="Rounding Cat",
        slug=f"rnd-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="Rounding SKU",
        sku=f"RSK-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="Rounding T",
        terminal_code=f"RT-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add_all([product, terminal])
    await db_session.flush()
    pv = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv)
    await db_session.flush()
    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=None,
        customer_id=None,
        status="checkout_locked",
        subtotal=total,
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=total,
    )
    db_session.add(cart)
    await db_session.flush()
    db_session.add(
        PosCartLine(
            cart_id=cart.id,
            product_id=product.id,
            variant_id=pv.id,
            qty=1,
            unit_price=total,
            line_total=total,
        )
    )
    db_session.add(
        StockLevel(
            branch_id=branch.id,
            product_id=product.id,
            variant_id=pv.id,
            on_hand=10,
            reserved=0,
            version=0,
        )
    )
    await db_session.commit()
    return branch, user, category, product, terminal, cart, pv
