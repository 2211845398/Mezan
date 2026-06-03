from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.models.branch import Branch
from app.models.branch_sequence import BranchSequence
from app.models.category import Category
from app.models.pos_cart import PosCart, PosCartLine
from app.models.pos_payment import PaymentIntent, PaymentReceipt
from app.models.pos_shift import PosShift
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sales_invoice import SalesInvoice
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.models.users import User
from app.services import invoice_service


@pytest.mark.asyncio
async def test_finalize_rolls_back_partial_work_when_gl_posting_fails(
    db_session, monkeypatch
) -> None:
    branch = Branch(
        name="Atomicity Store",
        code=f"AT-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"atomicity-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Atomicity Tester",
        password_hash="not-used-in-this-test",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="Atomicity Category",
        slug=f"atomicity-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()

    product_one = Product(
        category_id=category.id,
        name="Atomicity Product One",
        sku=f"AT-P1-{uuid.uuid4().hex[:8]}",
        status="active",
        standard_cost=Decimal("10.0000"),
    )
    product_two = Product(
        category_id=category.id,
        name="Atomicity Product Two",
        sku=f"AT-P2-{uuid.uuid4().hex[:8]}",
        status="active",
        standard_cost=Decimal("15.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="Atomicity Terminal",
        terminal_code=f"AT-TERM-{uuid.uuid4().hex[:8]}",
        api_key_hash="atomicity-test-key-hash",
        is_authorized=True,
    )
    db_session.add_all([product_one, product_two, terminal])
    await db_session.flush()
    v_one = ProductVariant(
        product_id=product_one.id,
        sku=f"{product_one.sku}-V",
        attribute_values={},
        active=True,
    )
    v_two = ProductVariant(
        product_id=product_two.id,
        sku=f"{product_two.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add_all([v_one, v_two])
    await db_session.flush()
    branch_id = branch.id
    user_id = user.id
    product_one_id = product_one.id
    product_two_id = product_two.id
    terminal_id = terminal.id

    cart = PosCart(
        terminal_id=terminal_id,
        branch_id=branch_id,
        shift_id=None,
        customer_id=None,
        status="checkout_locked",
        subtotal=Decimal("80.00"),
        discount_total=Decimal("0.00"),
        total=Decimal("80.00"),
    )
    db_session.add(cart)
    await db_session.flush()
    cart_id = cart.id

    payment_intent = PaymentIntent(
        cart_id=cart_id,
        provider="mock",
        amount=Decimal("80.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        status="succeeded",
        external_id="atomicity-payment",
    )
    db_session.add(payment_intent)
    db_session.add_all(
        [
            PosCartLine(
                cart_id=cart_id,
                product_id=product_one_id,
                variant_id=v_one.id,
                qty=2,
                unit_price=Decimal("25.00"),
                line_total=Decimal("50.00"),
            ),
            PosCartLine(
                cart_id=cart_id,
                product_id=product_two_id,
                variant_id=v_two.id,
                qty=1,
                unit_price=Decimal("30.00"),
                line_total=Decimal("30.00"),
            ),
            StockLevel(
                branch_id=branch_id,
                product_id=product_one_id,
                variant_id=v_one.id,
                on_hand=10,
                reserved=0,
                version=0,
            ),
            StockLevel(
                branch_id=branch_id,
                product_id=product_two_id,
                variant_id=v_two.id,
                on_hand=8,
                reserved=0,
                version=0,
            ),
        ]
    )
    await db_session.commit()
    payment_intent_id = payment_intent.id

    async def _fail_gl_post(*args, **kwargs) -> None:
        raise RuntimeError("GL posting failed")

    monkeypatch.setattr(invoice_service, "post_sales_invoice_gl", _fail_gl_post)

    idempotency_key = f"atomicity-{uuid.uuid4().hex}"
    with pytest.raises(RuntimeError, match="GL posting failed"):
        await invoice_service.finalize_paid_cart(
            db_session,
            cart_id=cart_id,
            payment_intent_id=payment_intent_id,
            idempotency_key=idempotency_key,
            user_id=user_id,
        )

    await db_session.rollback()

    invoice = await db_session.execute(select(SalesInvoice).where(SalesInvoice.cart_id == cart_id))
    assert invoice.scalar_one_or_none() is None

    cart_row = await db_session.execute(select(PosCart).where(PosCart.id == cart_id))
    persisted_cart = cart_row.scalar_one()
    assert persisted_cart.status == "checkout_locked"
    assert persisted_cart.paid_at is None

    level_one = await db_session.execute(
        select(StockLevel).where(
            StockLevel.branch_id == branch_id,
            StockLevel.product_id == product_one_id,
        )
    )
    persisted_level_one = level_one.scalar_one()
    assert persisted_level_one.on_hand == 10
    assert persisted_level_one.version == 0

    level_two = await db_session.execute(
        select(StockLevel).where(
            StockLevel.branch_id == branch_id,
            StockLevel.product_id == product_two_id,
        )
    )
    persisted_level_two = level_two.scalar_one()
    assert persisted_level_two.on_hand == 8
    assert persisted_level_two.version == 0

    movements = await db_session.execute(
        select(StockMovement).where(StockMovement.idempotency_key.like(f"{idempotency_key}:%"))
    )
    assert list(movements.scalars().all()) == []

    sequences = await db_session.execute(
        select(BranchSequence).where(
            BranchSequence.branch_id == branch_id,
            BranchSequence.year == datetime.now(UTC).year,
        )
    )
    assert sequences.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_finalize_cash_sale_updates_shift_expected_cash(db_session, monkeypatch) -> None:
    """Cash finalize must bump PosShift.expected_cash (Epic 21.3) via shift_service.add_cash_event."""
    branch = Branch(
        name="Expected Cash Store",
        code=f"EC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"ecash-{uuid.uuid4().hex[:8]}@example.com",
        first_name="ECash Tester",
        password_hash="not-used-in-this-test",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="ECash Category",
        slug=f"ecash-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="ECash Product",
        sku=f"EC-P-{uuid.uuid4().hex[:8]}",
        status="active",
        standard_cost=Decimal("10.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="ECash Terminal",
        terminal_code=f"EC-TERM-{uuid.uuid4().hex[:8]}",
        api_key_hash="ecash-test-key-hash",
        is_authorized=True,
    )
    db_session.add_all([product, terminal])
    await db_session.flush()
    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(variant)
    await db_session.flush()

    opening = Decimal("50.00")
    shift = PosShift(
        terminal_id=terminal.id,
        branch_id=branch.id,
        opened_by_user_id=user.id,
        status="open",
        opening_float=opening,
        expected_cash=opening,
    )
    db_session.add(shift)
    await db_session.flush()
    shift_id = shift.id

    sale_total = Decimal("80.00")
    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=shift_id,
        customer_id=None,
        status="checkout_locked",
        subtotal=sale_total,
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=sale_total,
    )
    db_session.add(cart)
    await db_session.flush()
    cart_id = cart.id

    payment_intent = PaymentIntent(
        cart_id=cart_id,
        provider="mock",
        amount=sale_total,
        currency="USD",
        exchange_rate=Decimal("1"),
        status="succeeded",
        external_id="ecash-payment",
    )
    db_session.add(payment_intent)
    await db_session.flush()
    db_session.add(
        PaymentReceipt(
            payment_intent_id=payment_intent.id,
            amount=sale_total,
            method="cash",
            reference="cash-1",
            card_last4=None,
        )
    )
    db_session.add_all(
        [
            PosCartLine(
                cart_id=cart_id,
                product_id=product.id,
                variant_id=variant.id,
                qty=2,
                unit_price=Decimal("40.00"),
                line_total=sale_total,
            ),
            StockLevel(
                branch_id=branch.id,
                product_id=product.id,
                variant_id=variant.id,
                on_hand=10,
                reserved=0,
                version=0,
            ),
        ]
    )
    await db_session.commit()
    payment_intent_id = payment_intent.id

    monkeypatch.setattr(
        invoice_service,
        "post_sales_invoice_gl",
        AsyncMock(return_value=None),
    )

    await invoice_service.finalize_paid_cart(
        db_session,
        cart_id=cart_id,
        payment_intent_id=payment_intent_id,
        idempotency_key=f"ecash-{uuid.uuid4().hex}",
        user_id=user.id,
    )

    sh_row = await db_session.execute(select(PosShift).where(PosShift.id == shift_id))
    sh = sh_row.scalar_one()
    assert sh.expected_cash == opening + sale_total
