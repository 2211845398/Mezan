"""Category revenue breakdown BI endpoint."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.category import Category
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.services.catalog_service import resolve_default_variant_id


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _create_category(
    db_session: AsyncSession,
    *,
    name: str,
    parent_id: int | None = None,
) -> Category:
    category = Category(
        parent_id=parent_id,
        name=name,
        slug=_unique("cat"),
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    return category


async def _create_product(db_session: AsyncSession, *, category_id: int, name: str) -> Product:
    product = Product(
        category_id=category_id,
        name=name,
        sku=_unique("sku"),
        status="active",
    )
    db_session.add(product)
    await db_session.flush()
    db_session.add(
        ProductVariant(
            product_id=product.id,
            sku=f"{product.sku}-V",
            attribute_values={},
            active=True,
        )
    )
    await db_session.flush()
    return product


async def _create_sales_invoice(
    db_session: AsyncSession,
    *,
    branch_id: int,
    terminal_id: int,
    product_id: int,
    total: Decimal,
) -> SalesInvoice:
    from app.models.pos_cart import PosCart

    created_at = datetime.now(UTC)
    cart = PosCart(
        terminal_id=terminal_id,
        branch_id=branch_id,
        status="paid",
        subtotal=total,
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=total,
        paid_at=created_at,
    )
    db_session.add(cart)
    await db_session.flush()

    invoice = SalesInvoice(
        invoice_number=_unique("INV"),
        invoice_barcode=_unique("BAR"),
        cart_id=cart.id,
        terminal_id=terminal_id,
        branch_id=branch_id,
        subtotal=total,
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=total,
        amount_paid=total,
        rounding_difference=Decimal("0.00"),
        created_at=created_at,
    )
    db_session.add(invoice)
    await db_session.flush()

    variant_id = await resolve_default_variant_id(db_session, product_id=product_id)
    db_session.add(
        SalesInvoiceLine(
            sales_invoice_id=invoice.id,
            product_id=product_id,
            variant_id=variant_id,
            qty=1,
            unit_price=total,
            line_total=total,
            tax_rate=Decimal("0"),
            line_tax_amount=Decimal("0.00"),
        )
    )
    await db_session.flush()
    return invoice


@pytest.mark.core
@pytest.mark.asyncio
async def test_category_revenue_breakdown_self_children_and_products(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_auth_header: dict[str, str],
    default_branch_id: int,
) -> None:
    parent = await _create_category(db_session, name="Parent Cat")
    child = await _create_category(db_session, name="Child Cat", parent_id=parent.id)
    other = await _create_category(db_session, name="Other Cat")

    parent_product = await _create_product(db_session, category_id=parent.id, name="Parent Product")
    child_product = await _create_product(db_session, category_id=child.id, name="Child Product")
    await _create_product(db_session, category_id=other.id, name="Other Product")

    branch = await db_session.get(Branch, default_branch_id)
    assert branch is not None
    terminal = POSTerminal(
        branch_id=branch.id,
        name=_unique("terminal"),
        terminal_code=_unique("term"),
        api_key_hash="hash",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()

    await _create_sales_invoice(
        db_session,
        branch_id=branch.id,
        terminal_id=terminal.id,
        product_id=parent_product.id,
        total=Decimal("100.00"),
    )
    await _create_sales_invoice(
        db_session,
        branch_id=branch.id,
        terminal_id=terminal.id,
        product_id=child_product.id,
        total=Decimal("50.00"),
    )
    await db_session.commit()

    today = datetime.now(UTC).date().isoformat()
    res = await client.get(
        f"/api/v1/bi/categories/{parent.id}/revenue",
        headers=admin_auth_header,
        params={"period_start": today, "period_end": today},
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["category_id"] == parent.id
    assert body["self"]["category_name"] == "Parent Cat"
    assert Decimal(body["self"]["gross_sales"]) == Decimal("100.00")
    assert body["self"]["invoice_count"] == 1

    child_row = next(c for c in body["children"] if c["category_id"] == child.id)
    assert Decimal(child_row["gross_sales"]) == Decimal("50.00")
    assert child_row["invoice_count"] == 1

    assert len(body["products"]) == 1
    assert body["products"][0]["product_id"] == parent_product.id
    assert Decimal(body["products"][0]["gross_sales"]) == Decimal("100.00")
