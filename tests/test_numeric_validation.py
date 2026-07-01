"""Numeric field validation guards (prices, discounts, payroll, POS cash)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.errors import ValidationError
from app.schemas.catalog import ProductCreate, ProductUpdate
from app.schemas.discount import DiscountRuleUpdate
from app.schemas.employees import EmployeeProfileCreate
from app.services import payment_service, pricing_service


def test_product_create_rejects_negative_standard_cost() -> None:
    with pytest.raises(PydanticValidationError):
        ProductCreate(
            category_id=1,
            name="X",
            sku="X-1",
            standard_cost=Decimal("-1.00"),
        )


def test_product_update_rejects_non_positive_sell_price() -> None:
    with pytest.raises(PydanticValidationError):
        ProductUpdate(sell_price=Decimal("0"))


def test_discount_rule_update_rejects_negative_min_order() -> None:
    with pytest.raises(PydanticValidationError):
        DiscountRuleUpdate(min_order_amount=Decimal("-5"))


def test_employee_create_rejects_negative_salary() -> None:
    with pytest.raises(PydanticValidationError):
        EmployeeProfileCreate(
            user_id=1,
            hire_date="2024-01-01",
            base_salary=Decimal("-100"),
        )


@pytest.mark.asyncio
async def test_set_product_sell_price_rejects_zero(db_session) -> None:
    from app.models.category import Category
    from app.models.product import Product

    category = Category(
        name="NumCat",
        slug=f"num-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="Num SKU",
        sku=f"NS-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
    )
    db_session.add(product)
    await db_session.flush()

    with pytest.raises(ValidationError, match="greater than zero"):
        await pricing_service.set_product_sell_price(
            db_session,
            product_id=product.id,
            amount=Decimal("0"),
        )


@pytest.mark.asyncio
async def test_capture_payment_allows_zero_cash_with_customer(db_session, monkeypatch) -> None:
    from app.models.branch import Branch
    from app.models.category import Category
    from app.models.customer_profile import CustomerProfile
    from app.models.pos_cart import PosCart, PosCartLine
    from app.models.pos_payment import PaymentIntent
    from app.models.pos_terminal import POSTerminal
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.users import User
    from app.services.seed_service import seed_accounting_defaults

    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="Zero Cash Store",
        code=f"ZC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"zc-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Zero",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="ZC Cat",
        slug=f"zc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()
    customer = CustomerProfile(
        phone=f"09{uuid.uuid4().int % 10_000_000:08d}"[:10],
        is_active=True,
        is_temporary=False,
    )
    product = Product(
        category_id=category.id,
        name="ZC SKU",
        sku=f"ZC-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="ZC T",
        terminal_code=f"ZT-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add_all([customer, product, terminal])
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
        customer_id=customer.id,
        status="checkout_locked",
        subtotal=Decimal("10.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("10.00"),
    )
    db_session.add(cart)
    await db_session.flush()
    db_session.add(
        PosCartLine(
            cart_id=cart.id,
            product_id=product.id,
            variant_id=pv.id,
            qty=1,
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        )
    )
    intent = PaymentIntent(
        cart_id=cart.id,
        provider="in_store",
        amount=Decimal("10.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        status="requires_payment",
        external_id="ext-zero",
    )
    db_session.add(intent)
    await db_session.commit()

    class _Provider:
        name = "in_store"

        async def capture(self, **_kwargs):
            class _R:
                status = "succeeded"
                payload = {}

            return _R()

    monkeypatch.setattr(payment_service, "get_provider", lambda _name: _Provider())

    captured = await payment_service.capture_payment(
        db_session,
        payment_intent_id=intent.id,
        idempotency_key=f"idem-{uuid.uuid4().hex}",
        method="cash",
        reference=None,
        card_last4=None,
        cash_tendered=Decimal("0.00"),
    )
    assert captured.status == "succeeded"


@pytest.mark.asyncio
async def test_capture_payment_rejects_zero_cash_without_customer(db_session, monkeypatch) -> None:
    from app.models.branch import Branch
    from app.models.pos_cart import PosCart
    from app.models.pos_payment import PaymentIntent
    from app.models.pos_terminal import POSTerminal
    from app.models.users import User
    from app.services.seed_service import seed_accounting_defaults

    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="No Cust Store",
        code=f"NC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"nc-{uuid.uuid4().hex[:8]}@example.com",
        first_name="NoCust",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([branch, user])
    await db_session.flush()
    terminal = POSTerminal(
        branch_id=branch.id,
        name="NC T",
        terminal_code=f"NT-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()
    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=None,
        customer_id=None,
        status="checkout_locked",
        subtotal=Decimal("10.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("10.00"),
    )
    db_session.add(cart)
    await db_session.flush()
    intent = PaymentIntent(
        cart_id=cart.id,
        provider="in_store",
        amount=Decimal("10.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        status="requires_payment",
        external_id="ext-nocust",
    )
    db_session.add(intent)
    await db_session.commit()

    with pytest.raises(ValidationError, match="Partial cash requires"):
        await payment_service.capture_payment(
            db_session,
            payment_intent_id=intent.id,
            idempotency_key=f"idem-{uuid.uuid4().hex}",
            method="cash",
            reference=None,
            card_last4=None,
            cash_tendered=Decimal("0.00"),
        )
