"""Transfer batches: reserve on create, in-transit reporting, receive at destination."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.branch import Branch
from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_level import StockLevel
from app.models.transfer_batch import TransferBatch
from app.models.unit_of_measure import UnitOfMeasure
from app.services.catalog_service import create_product
from app.services.inventory_reporting_service import list_stock_on_hand
from app.services.inventory_service import apply_stock_movement
from app.services.transfer_service import (
    cancel_pending_batch,
    create_batch,
    dispatch_batch,
    receive_batch,
)


async def _seed_product_with_stock(
    db_session,
    *,
    branch_id: int,
    qty: int = 20,
) -> tuple[Product, ProductVariant]:
    category = Category(
        name="Xfer Cat",
        slug=f"xc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Xfer SKU",
        sku=f"xk-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        standard_cost=Decimal("4.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()
    pv = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv)
    await db_session.flush()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed:{product.id}:{branch_id}",
        branch_id=branch_id,
        product_id=product.id,
        qty_delta=qty,
        reason="adjustment",
        variant_id=pv.id,
    )
    return product, pv


@pytest.mark.asyncio
async def test_transfer_reserve_and_in_transit_flow(db_session) -> None:
    b_from = Branch(
        name="Xfer From",
        code=f"XF-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    b_to = Branch(
        name="Xfer To",
        code=f"XT-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add_all([b_from, b_to])
    await db_session.flush()

    product, pv = await _seed_product_with_stock(db_session, branch_id=b_from.id, qty=20)
    xfer_qty = 5

    batch = await create_batch(
        db_session,
        created_by_user_id=None,
        data={
            "from_branch_id": b_from.id,
            "to_branch_id": b_to.id,
            "lines": [{"product_id": product.id, "variant_id": pv.id, "qty": xfer_qty}],
        },
    )
    assert batch.status == "pending_dispatch"

    sl_from = (
        await db_session.execute(
            select(StockLevel).where(
                StockLevel.branch_id == b_from.id,
                StockLevel.product_id == product.id,
                StockLevel.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert sl_from.on_hand == 20
    assert sl_from.reserved == xfer_qty

    dispatched = await dispatch_batch(db_session, batch_id=batch.id)
    assert dispatched.status == "in_transit"

    await db_session.refresh(sl_from)
    assert sl_from.on_hand == 20 - xfer_qty
    assert sl_from.reserved == 0

    rows_dest = await list_stock_on_hand(db_session, branch_id=b_to.id)
    dest_row = next(
        (r for r in rows_dest if r.product_id == product.id and r.variant_id == pv.id),
        None,
    )
    assert dest_row is not None
    assert dest_row.on_hand == 0
    assert dest_row.in_transit_in == xfer_qty

    received = await receive_batch(db_session, batch_id=batch.id)
    assert received.status == "received"

    rows_dest_after = await list_stock_on_hand(db_session, branch_id=b_to.id)
    dest_after = next(
        (r for r in rows_dest_after if r.product_id == product.id and r.variant_id == pv.id),
        None,
    )
    assert dest_after is not None
    assert dest_after.on_hand == xfer_qty
    assert dest_after.in_transit_in == 0


@pytest.mark.asyncio
async def test_transfer_cancel_releases_reserve(db_session) -> None:
    b_from = Branch(
        name="Xfer From",
        code=f"XC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    b_to = Branch(
        name="Xfer To",
        code=f"XD-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add_all([b_from, b_to])
    await db_session.flush()

    product, pv = await _seed_product_with_stock(db_session, branch_id=b_from.id, qty=10)
    batch = await create_batch(
        db_session,
        created_by_user_id=None,
        data={
            "from_branch_id": b_from.id,
            "to_branch_id": b_to.id,
            "lines": [{"product_id": product.id, "variant_id": pv.id, "qty": 3}],
        },
    )
    await cancel_pending_batch(db_session, batch_id=batch.id)
    await db_session.commit()

    sl = (
        await db_session.execute(
            select(StockLevel).where(
                StockLevel.branch_id == b_from.id,
                StockLevel.product_id == product.id,
                StockLevel.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert sl.reserved == 0
    assert sl.on_hand == 10

    gone = await db_session.execute(select(TransferBatch).where(TransferBatch.id == batch.id))
    assert gone.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_transfer_line_box_uses_qty_base(db_session) -> None:
    b_from = Branch(
        name="Xfer From",
        code=f"XB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    b_to = Branch(
        name="Xfer To",
        code=f"XC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add_all([b_from, b_to])
    await db_session.flush()

    piece = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
    ).scalar_one()
    box = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "BOX"))
    ).scalar_one()

    cat = Category(
        name="Xfer UOM Cat",
        slug=f"xu-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Boxed",
            "sku": f"bx-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
            "uom_id": piece.id,
            "alternative_uoms": [{"uom_id": box.id, "factor_to_base": "12"}],
        },
    )
    pv = (
        await db_session.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
        )
    ).scalar_one()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-box:{product.id}",
        branch_id=b_from.id,
        product_id=product.id,
        qty_delta=24,
        reason="adjustment",
        variant_id=pv.id,
    )

    batch = await create_batch(
        db_session,
        created_by_user_id=None,
        data={
            "from_branch_id": b_from.id,
            "to_branch_id": b_to.id,
            "lines": [
                {
                    "product_id": product.id,
                    "variant_id": pv.id,
                    "qty": 1,
                    "uom_id": box.id,
                }
            ],
        },
    )
    ln = batch.lines[0]
    assert ln.qty == 1
    assert ln.qty_base == 12
    assert ln.uom_id == box.id

    sl_from = (
        await db_session.execute(
            select(StockLevel).where(
                StockLevel.branch_id == b_from.id,
                StockLevel.product_id == product.id,
                StockLevel.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert sl_from.reserved == 12
