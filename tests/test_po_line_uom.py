"""Purchase order lines: unit of measure and qty_base conversion."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.branch_product_costs import BranchProductCost
from app.models.category import Category
from app.models.product import Product
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.stock_level import StockLevel
from app.models.unit_of_measure import UnitOfMeasure
from app.services.catalog_service import create_product, resolve_default_variant_id
from app.services.goods_receipt_service import receive_goods_for_purchase_order
from app.services.purchase_order_service import create_po, mark_po_sent
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_po_line_box_sets_qty_base(db_session) -> None:
    cat = Category(
        name="PO UOM Cat", slug=f"po-uom-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True
    )
    db_session.add(cat)
    await db_session.flush()

    piece = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
    ).scalar_one()
    box = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "BOX"))
    ).scalar_one()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Packaged",
            "sku": f"pk-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
            "uom_id": piece.id,
            "alternative_uoms": [{"uom_id": box.id, "factor_to_base": "12"}],
        },
    )

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "Supplier",
            "branch_id": None,
            "lines": [{"product_id": product.id, "qty": 1, "uom_id": box.id}],
        },
    )
    pol = po.lines[0]
    assert pol.uom_id == box.id
    assert pol.qty == 1
    assert pol.qty_base == 12


@pytest.mark.asyncio
async def test_po_line_rejects_unknown_uom(db_session) -> None:
    cat = Category(
        name="PO UOM Reject", slug=f"po-rej-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True
    )
    db_session.add(cat)
    await db_session.flush()

    piece = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
    ).scalar_one()
    box = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "BOX"))
    ).scalar_one()

    product = Product(
        category_id=cat.id,
        name="Simple",
        sku=f"sm-{uuid.uuid4().hex[:6]}",
        status="active",
        uom_id=piece.id,
        standard_cost=Decimal("1"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    with pytest.raises(ValidationError, match="not configured"):
        await create_po(
            db_session,
            created_by_user_id=None,
            data={
                "supplier_name": "Supplier",
                "branch_id": None,
                "lines": [{"product_id": product.id, "qty": 1, "uom_id": box.id}],
            },
        )


@pytest.mark.asyncio
async def test_receive_increases_stock_by_qty_base(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="UOM Recv Branch",
        code=f"URB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
        kind="warehouse",
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(
        name="PO Recv UOM", slug=f"pru-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True
    )
    db_session.add(cat)
    await db_session.flush()

    piece = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
    ).scalar_one()
    box = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "BOX"))
    ).scalar_one()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Cartons",
            "sku": f"ct-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
            "uom_id": piece.id,
            "alternative_uoms": [{"uom_id": box.id, "factor_to_base": "12"}],
        },
    )

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "Supplier",
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "qty": 2, "uom_id": box.id}],
        },
    )
    pol: PurchaseOrderLine = po.lines[0]
    assert pol.qty_base == 24

    await mark_po_sent(db_session, po_id=po.id)
    await db_session.commit()

    variant_id = await resolve_default_variant_id(db_session, product_id=product.id)
    await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        created_by_user_id=None,
        lines=[
            {
                "purchase_order_line_id": pol.id,
                "qty": 2,
                "unit_cost": "5.00",
                "variant_id": variant_id,
            }
        ],
        idempotency_key=f"gr-uom-{uuid.uuid4().hex}",
    )

    sl_res = await db_session.execute(
        select(StockLevel.on_hand).where(
            StockLevel.branch_id == branch.id,
            StockLevel.product_id == product.id,
            StockLevel.variant_id == variant_id,
        )
    )
    on_hand = int(sl_res.scalar_one_or_none() or 0)
    assert on_hand == 24

    cost_row = (
        await db_session.execute(
            select(BranchProductCost).where(
                BranchProductCost.branch_id == branch.id,
                BranchProductCost.product_id == product.id,
                BranchProductCost.variant_id == variant_id,
            )
        )
    ).scalar_one()
    # 5.00 per box / 12 pieces per box
    assert cost_row.average_unit_cost == Decimal("0.4167")
