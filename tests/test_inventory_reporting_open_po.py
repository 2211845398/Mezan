"""Open PO qty map tolerates nullable purchase_order_lines.variant_id."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models.branch import Branch
from app.models.category import Category
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.services.inventory_reporting_service import (
    _on_order_qty_for_branch_product,
    _open_po_qty_map,
)


@pytest.mark.asyncio
async def test_open_po_qty_map_accepts_null_variant_id(db_session) -> None:
    branch = Branch(
        name="Rep Branch",
        code=f"RB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="Rep Cat",
        slug=f"rc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Rep Product",
        sku=f"rp-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    po = PurchaseOrder(
        supplier_name="S",
        branch_id=branch.id,
        status="sent",
    )
    db_session.add(po)
    await db_session.flush()

    db_session.add(
        PurchaseOrderLine(
            purchase_order_id=po.id,
            product_id=product.id,
            variant_id=None,
            qty=12,
            uom_id=product.uom_id,
            qty_base=12,
            unit_cost=Decimal("5.0000"),
        )
    )
    await db_session.commit()

    m = await _open_po_qty_map(db_session)
    assert m[(branch.id, product.id, None)] == 12
    assert _on_order_qty_for_branch_product(
        m, branch_id=branch.id, product_id=product.id
    ) == 12


@pytest.mark.asyncio
async def test_open_po_qty_map_excludes_draft(db_session) -> None:
    branch = Branch(
        name="Draft Branch",
        code=f"DB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="Draft Cat",
        slug=f"dc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Draft PO Product",
        sku=f"dp-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    po = PurchaseOrder(
        supplier_name="S",
        branch_id=branch.id,
        status="draft",
    )
    db_session.add(po)
    await db_session.flush()

    db_session.add(
        PurchaseOrderLine(
            purchase_order_id=po.id,
            product_id=product.id,
            variant_id=None,
            qty=99,
            uom_id=product.uom_id,
            qty_base=99,
            unit_cost=Decimal("5.0000"),
        )
    )
    await db_session.commit()

    m = await _open_po_qty_map(db_session)
    assert m.get((branch.id, product.id, None), 0) == 0
