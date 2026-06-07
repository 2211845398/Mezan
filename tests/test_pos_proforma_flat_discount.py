"""POS proforma quote/export and direct flat cart discount."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.services.cart_service import FLAT_CART_DISCOUNT_CODE, apply_flat_discount, create_cart


@pytest.mark.asyncio
async def test_apply_flat_discount_rejects_over_subtotal(db_session) -> None:
    from app.models.branch import Branch
    from app.models.category import Category
    from app.models.pos_terminal import POSTerminal
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.users import User
    from app.core.errors import ValidationError
    from app.services.cart_service import upsert_line

    branch = Branch(
        name="Flat Disc",
        code=f"FD-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"fd-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Flat",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    category = Category(
        name="FD Cat",
        slug=f"fd-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add_all([branch, user, category])
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="FD Item",
        sku=f"FD-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("5.0000"),
    )
    terminal = POSTerminal(
        branch_id=branch.id,
        name="FD T",
        terminal_code=f"FDT-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add_all([product, terminal])
    await db_session.flush()
    from app.services.pricing_service import set_product_sell_price

    await set_product_sell_price(
        db_session, product_id=product.id, amount=Decimal("50.00"), variant_id=None
    )
    pv = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv)
    await db_session.flush()
    cart = await create_cart(
        db_session, terminal_id=terminal.id, shift_id=None, customer_id=None, created_by_user_id=user.id
    )
    await upsert_line(
        db_session,
        cart_id=cart.id,
        product_id=product.id,
        qty=1,
        created_by_user_id=user.id,
        variant_id=pv.id,
    )
    with pytest.raises(ValidationError):
        await apply_flat_discount(
            db_session, cart_id=cart.id, amount=Decimal("100.00"), created_by_user_id=user.id
        )


@pytest.mark.asyncio
async def test_proforma_quote_uses_active_sell_price(client, admin_auth_header) -> None:
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": "PF Cat",
            "slug": f"pf-{uuid.uuid4().hex[:8]}",
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
            "name": "Proforma Item",
            "sku": f"PF-{uuid.uuid4().hex[:8]}",
            "status": "active",
            "sell_price": 25.0,
        },
    )
    assert prod.status_code == 201, prod.text
    product_id = prod.json()["id"]

    quote = await client.post(
        "/api/v1/pos/proforma/quote",
        headers=admin_auth_header,
        json={"lines": [{"product_id": product_id, "qty": 2}]},
    )
    assert quote.status_code == 200, quote.text
    body = quote.json()
    assert Decimal(str(body["subtotal"])) == Decimal("50.00")
    assert len(body["lines"]) == 1
    assert Decimal(str(body["lines"][0]["unit_price"])) == Decimal("25.00")


@pytest.mark.asyncio
async def test_proforma_export_pdf_and_xlsx(client, admin_auth_header, commercial_branch_id) -> None:
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": "PFX Cat",
            "slug": f"pfx-{uuid.uuid4().hex[:8]}",
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
            "name": "Export Item",
            "sku": f"PFE-{uuid.uuid4().hex[:8]}",
            "status": "active",
            "sell_price": 15.0,
        },
    )
    assert prod.status_code == 201, prod.text
    product_id = prod.json()["id"]
    lines = [{"product_id": product_id, "qty": 1}]

    pdf = await client.post(
        "/api/v1/pos/proforma/export.pdf",
        headers=admin_auth_header,
        json={"lines": lines, "branch_id": commercial_branch_id, "locale": "ar"},
    )
    assert pdf.status_code == 200, pdf.text
    assert pdf.content[:4] == b"%PDF"

    xlsx = await client.post(
        "/api/v1/pos/proforma/export.xlsx",
        headers=admin_auth_header,
        json={"lines": lines, "branch_id": commercial_branch_id, "locale": "en"},
    )
    assert xlsx.status_code == 200, xlsx.text
    assert xlsx.content[:2] == b"PK"


@pytest.mark.asyncio
async def test_flat_discount_api(client, admin_auth_header, commercial_branch_id) -> None:
    t = await client.post(
        "/api/v1/terminals",
        headers=admin_auth_header,
        json={
            "branch_id": commercial_branch_id,
            "name": "Flat POS",
            "terminal_code": f"FL-{uuid.uuid4().hex[:6]}",
        },
    )
    assert t.status_code == 200, t.text
    terminal_id = t.json()["id"]
    await client.patch(f"/api/v1/terminals/{terminal_id}/authorize", headers=admin_auth_header)
    shift = await client.post(
        "/api/v1/pos/shifts/open",
        headers=admin_auth_header,
        json={"terminal_id": terminal_id, "opening_float": 50.0},
    )
    assert shift.status_code == 201, shift.text
    cart = await client.post(
        "/api/v1/pos/carts",
        headers=admin_auth_header,
        json={"terminal_id": terminal_id, "shift_id": shift.json()["id"], "customer_id": None},
    )
    assert cart.status_code == 201, cart.text
    cart_id = cart.json()["id"]

    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": "FlatCat",
            "slug": f"fl-{uuid.uuid4().hex[:8]}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cat.json()["id"],
            "name": "Flat SKU",
            "sku": f"FL-SKU-{uuid.uuid4().hex[:8]}",
            "status": "active",
            "sell_price": 100.0,
        },
    )
    assert prod.status_code == 201, prod.text
    await client.post(
        f"/api/v1/pos/carts/{cart_id}/lines",
        headers=admin_auth_header,
        json={"product_id": prod.json()["id"], "qty": 1},
    )
    disc = await client.post(
        f"/api/v1/pos/carts/{cart_id}/discounts",
        headers=admin_auth_header,
        json={"mode": "flat", "amount": "10.00"},
    )
    assert disc.status_code == 200, disc.text
    payload = disc.json()
    assert Decimal(str(payload["discount_total"])) == Decimal("10.00")
    codes = [d["code"] for d in payload.get("discounts", [])]
    assert FLAT_CART_DISCOUNT_CODE in codes
