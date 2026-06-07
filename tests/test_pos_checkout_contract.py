"""Milestone 1 POS contract: checkout lock before pay/finalize; currency from master data."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.core.errors import StateTransitionError, ValidationError
from app.models.branch import Branch
from app.models.category import Category
from app.models.currency import Currency
from app.models.pos_cart import PosCart, PosCartLine
from app.models.pos_payment import PaymentIntent
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.users import User
from app.services import invoice_service, payment_service
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_payment_intent_rejected_when_cart_not_locked(db_session, monkeypatch) -> None:
    branch = Branch(
        name="Lock Contract Store",
        code=f"LC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"lock-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Lock Tester",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="Lock Cat",
        slug=f"lock-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="Lock SKU",
        sku=f"LK-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="Lock T",
        terminal_code=f"LT-{uuid.uuid4().hex[:8]}",
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
        status="active",
        subtotal=Decimal("10.00"),
        discount_total=Decimal("0.00"),
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
    await db_session.commit()

    async def _no_provider(*args, **kwargs):
        raise AssertionError("provider must not run when cart is not locked")

    monkeypatch.setattr(payment_service, "get_provider", _no_provider)

    with pytest.raises(ValidationError, match="checkout_locked"):
        await payment_service.create_payment_intent(
            db_session, cart_id=cart.id, provider_name="mock", currency="USD"
        )


@pytest.mark.asyncio
async def test_finalize_rejected_when_cart_not_locked(db_session, monkeypatch) -> None:
    branch = Branch(
        name="Fin Lock Store",
        code=f"FL-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"fin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Fin Tester",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="Fin Cat",
        slug=f"fin-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="Fin SKU",
        sku=f"FK-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="Fin T",
        terminal_code=f"FT-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add_all([product, terminal])
    await db_session.flush()
    pv_fin = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv_fin)
    await db_session.flush()
    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=None,
        customer_id=None,
        status="active",
        subtotal=Decimal("5.00"),
        discount_total=Decimal("0.00"),
        total=Decimal("5.00"),
    )
    db_session.add(cart)
    await db_session.flush()
    db_session.add(
        PosCartLine(
            cart_id=cart.id,
            product_id=product.id,
            variant_id=pv_fin.id,
            qty=1,
            unit_price=Decimal("5.00"),
            line_total=Decimal("5.00"),
        )
    )
    await db_session.flush()
    intent = PaymentIntent(
        cart_id=cart.id,
        provider="mock",
        amount=Decimal("5.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        status="succeeded",
        external_id="fin-test",
    )
    db_session.add(intent)
    await db_session.commit()

    monkeypatch.setattr(invoice_service, "post_sales_invoice_gl", lambda *a, **k: None)

    with pytest.raises(StateTransitionError, match="checkout_locked"):
        await invoice_service.finalize_paid_cart(
            db_session,
            cart_id=cart.id,
            payment_intent_id=intent.id,
            idempotency_key=f"idem-{uuid.uuid4().hex}",
            user_id=user.id,
        )


@pytest.mark.asyncio
async def test_payment_intent_unknown_currency_rejected(
    client, admin_auth_header, commercial_branch_id
) -> None:
    t = await client.post(
        "/api/v1/terminals",
        headers=admin_auth_header,
        json={
            "branch_id": commercial_branch_id,
            "name": "CUR-1",
            "terminal_code": f"CUR-{uuid.uuid4().hex[:6]}",
        },
    )
    assert t.status_code == 200, t.text
    terminal_id = t.json()["id"]
    auth_t = await client.patch(
        f"/api/v1/terminals/{terminal_id}/authorize", headers=admin_auth_header
    )
    assert auth_t.status_code == 200, auth_t.text
    s = await client.post(
        "/api/v1/pos/shifts/open",
        headers=admin_auth_header,
        json={"terminal_id": terminal_id, "opening_float": 50.0},
    )
    assert s.status_code == 201, s.text
    shift_id = s.json()["id"]
    c = await client.post(
        "/api/v1/pos/carts",
        headers=admin_auth_header,
        json={"terminal_id": terminal_id, "shift_id": shift_id, "customer_id": None},
    )
    assert c.status_code == 201, c.text
    cart_id = c.json()["id"]
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": "CurCat",
            "slug": f"cur-{uuid.uuid4().hex[:8]}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert cat.status_code == 201, cat.text
    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cat.json()["id"],
            "name": "CurItem",
            "sku": f"CI-{uuid.uuid4().hex[:8]}",
            "status": "active",
            "sell_price": 10.0,
        },
    )
    assert prod.status_code == 201, prod.text
    line = await client.post(
        f"/api/v1/pos/carts/{cart_id}/lines",
        headers=admin_auth_header,
        json={"product_id": prod.json()["id"], "qty": 1},
    )
    assert line.status_code == 200, line.text
    lock = await client.post(
        f"/api/v1/pos/carts/{cart_id}/state",
        headers=admin_auth_header,
        json={"action": "lock"},
    )
    assert lock.status_code == 200, lock.text
    pi = await client.post(
        "/api/v1/pos/payments/intents",
        headers=admin_auth_header,
        json={"cart_id": cart_id, "provider": "mock", "currency": "ZZZ"},
    )
    assert pi.status_code == 422, pi.text


@pytest.mark.asyncio
async def test_payment_intent_rejected_via_api_when_cart_active(
    client, admin_auth_header, commercial_branch_id
) -> None:
    t = await client.post(
        "/api/v1/terminals",
        headers=admin_auth_header,
        json={
            "branch_id": commercial_branch_id,
            "name": "AL-1",
            "terminal_code": f"AL-{uuid.uuid4().hex[:6]}",
        },
    )
    assert t.status_code == 200, t.text
    terminal_id = t.json()["id"]
    auth_t = await client.patch(
        f"/api/v1/terminals/{terminal_id}/authorize", headers=admin_auth_header
    )
    assert auth_t.status_code == 200, auth_t.text
    s = await client.post(
        "/api/v1/pos/shifts/open",
        headers=admin_auth_header,
        json={"terminal_id": terminal_id, "opening_float": 50.0},
    )
    assert s.status_code == 201, s.text
    shift_id = s.json()["id"]
    c = await client.post(
        "/api/v1/pos/carts",
        headers=admin_auth_header,
        json={"terminal_id": terminal_id, "shift_id": shift_id, "customer_id": None},
    )
    assert c.status_code == 201, c.text
    cart_id = c.json()["id"]
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": "AlCat",
            "slug": f"al-{uuid.uuid4().hex[:8]}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert cat.status_code == 201, cat.text
    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cat.json()["id"],
            "name": "AlItem",
            "sku": f"AI-{uuid.uuid4().hex[:8]}",
            "status": "active",
            "sell_price": 10.0,
        },
    )
    assert prod.status_code == 201, prod.text
    line = await client.post(
        f"/api/v1/pos/carts/{cart_id}/lines",
        headers=admin_auth_header,
        json={"product_id": prod.json()["id"], "qty": 1},
    )
    assert line.status_code == 200, line.text
    pi = await client.post(
        "/api/v1/pos/payments/intents",
        headers=admin_auth_header,
        json={"cart_id": cart_id, "provider": "mock", "currency": "USD"},
    )
    assert pi.status_code == 422, pi.text


@pytest.mark.asyncio
async def test_payment_intent_rejects_non_base_currency_without_fx_rate(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="FX Missing Branch",
        code=f"FXM-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"fxm-{uuid.uuid4().hex[:8]}@example.com",
        first_name="FX Missing",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="FXM Cat",
        slug=f"fxm-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="FXM SKU",
        sku=f"FXM-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="FXM T",
        terminal_code=f"FXMT-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add_all([product, terminal])
    await db_session.flush()
    pv_fxm = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv_fxm)
    await db_session.flush()
    db_session.add(
        Currency(
            code="GBP",
            name="Pound Sterling",
            decimal_places=2,
            suffix=None,
            exchange_rate_to_base=None,
        )
    )
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
    db_session.add(
        PosCartLine(
            cart_id=cart.id,
            product_id=product.id,
            variant_id=pv_fxm.id,
            qty=1,
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        )
    )
    await db_session.commit()

    with pytest.raises(ValidationError, match="No exchange rate configured"):
        await payment_service.create_payment_intent(
            db_session, cart_id=cart.id, provider_name="mock", currency="GBP"
        )


@pytest.mark.asyncio
async def test_payment_intent_snapshots_exchange_rate_for_non_base(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="FX Snap Branch",
        code=f"FXS-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"fxs-{uuid.uuid4().hex[:8]}@example.com",
        first_name="FX Snap",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="FXS Cat",
        slug=f"fxs-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="FXS SKU",
        sku=f"FXS-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="FXS T",
        terminal_code=f"FXST-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add_all([product, terminal])
    await db_session.flush()
    pv_fxs = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv_fxs)
    await db_session.flush()
    db_session.add(
        Currency(
            code="EUR",
            name="Euro",
            decimal_places=2,
            suffix=None,
            exchange_rate_to_base=Decimal("1.085"),
        )
    )
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
    db_session.add(
        PosCartLine(
            cart_id=cart.id,
            product_id=product.id,
            variant_id=pv_fxs.id,
            qty=1,
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        )
    )
    await db_session.commit()

    intent = await payment_service.create_payment_intent(
        db_session, cart_id=cart.id, provider_name="mock", currency="EUR"
    )
    assert intent.exchange_rate == Decimal("1.08500000")
