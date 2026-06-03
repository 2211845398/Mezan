"""Ad-hoc receipt, reservations, and human movement variant/UoM."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.branch import Branch
from app.models.branch_product_costs import BranchProductCost
from app.models.category import Category
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.models.unit_of_measure import UnitOfMeasure
from app.services.adhoc_goods_receipt_service import receive_adhoc_goods
from app.services.catalog_service import create_product
from app.services.inventory_damage_service import (
    list_damaged_positions,
    scrap_damaged_position,
    unmark_damaged_position,
)
from app.services.inventory_human_movement_service import apply_human_inventory_movement
from app.services.inventory_reservation_service import list_open_reservations, release_reservation
from app.services.inventory_service import apply_stock_movement
from app.services.stock_count_pdf_service import build_stock_count_pdf


@pytest.mark.asyncio
async def test_reserve_and_release_by_movement_id(db_session) -> None:
    branch = Branch(
        name="Res Branch",
        code=f"RB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(name="Res Cat", slug=f"rc-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Res Product",
            "sku": f"rp-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    from app.models.product_variant import ProductVariant

    pv = (
        await db_session.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
        )
    ).scalar_one()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-res:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=20,
        reason="adjustment",
        variant_id=pv.id,
    )

    reserve_mv = await apply_human_inventory_movement(
        db_session,
        user_id=1,
        idempotency_key=f"res-{uuid.uuid4().hex[:8]}",
        branch_id=branch.id,
        product_id=product.id,
        variant_id=pv.id,
        transaction_type="reserve",
        quantity=5,
        reason="manual_reserve",
    )
    await db_session.commit()

    open_rows = await list_open_reservations(db_session, branch_id=branch.id)
    assert any(r.movement_id == reserve_mv.id and r.qty_open == 5 for r in open_rows)

    await release_reservation(
        db_session,
        user_id=1,
        reserve_movement_id=reserve_mv.id,
        idempotency_key=f"rel-{uuid.uuid4().hex[:8]}",
        quantity=3,
    )
    await db_session.commit()

    open_after = await list_open_reservations(db_session, branch_id=branch.id)
    row = next(r for r in open_after if r.movement_id == reserve_mv.id)
    assert row.qty_open == 2


@pytest.mark.asyncio
async def test_adhoc_receipt_with_box_uom(db_session) -> None:
    branch = Branch(
        name="Adhoc Branch",
        code=f"AB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    piece = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "PIECE"))
    ).scalar_one()
    box = (
        await db_session.execute(select(UnitOfMeasure).where(UnitOfMeasure.code == "BOX"))
    ).scalar_one()

    cat = Category(
        name="Adhoc Cat", slug=f"ac-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True
    )
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Adhoc Boxed",
            "sku": f"ab-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
            "uom_id": piece.id,
            "alternative_uoms": [{"uom_id": box.id, "factor_to_base": "12"}],
        },
    )
    from app.models.product_variant import ProductVariant

    pv = (
        await db_session.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
        )
    ).scalar_one()

    ids = await receive_adhoc_goods(
        db_session,
        user_id=1,
        idempotency_key=f"adhoc-{uuid.uuid4().hex[:8]}",
        branch_id=branch.id,
        lines=[
            {
                "product_id": product.id,
                "variant_id": pv.id,
                "qty": 1,
                "uom_id": box.id,
                "unit_cost": Decimal("120.0000"),
            }
        ],
    )
    await db_session.commit()
    assert len(ids) == 1

    sl = (
        await db_session.execute(
            select(StockLevel).where(
                StockLevel.branch_id == branch.id,
                StockLevel.product_id == product.id,
                StockLevel.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert sl.on_hand == 12

    cost_row = (
        await db_session.execute(
            select(BranchProductCost).where(
                BranchProductCost.branch_id == branch.id,
                BranchProductCost.product_id == product.id,
                BranchProductCost.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert cost_row.average_unit_cost == Decimal("10.0000")

    mv = await db_session.get(StockMovement, ids[0])
    assert mv is not None
    assert mv.movement_kind == "add_stock"
    assert mv.qty_delta == 12


@pytest.mark.asyncio
async def test_damage_mark_list_unmark_scrap(db_session) -> None:
    branch = Branch(
        name="Dmg Branch",
        code=f"DB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(name="Dmg Cat", slug=f"dc-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Damage Prod",
            "sku": f"dp-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    from app.models.product_variant import ProductVariant

    pv = (
        await db_session.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
        )
    ).scalar_one()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-dmg:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=50,
        reason="adjustment",
        variant_id=pv.id,
    )
    await db_session.commit()

    await apply_human_inventory_movement(
        db_session,
        user_id=1,
        idempotency_key=f"mark-{uuid.uuid4().hex[:8]}",
        branch_id=branch.id,
        product_id=product.id,
        variant_id=pv.id,
        transaction_type="damage_mark",
        quantity=10,
        reason="test_damage",
    )
    await db_session.commit()

    rows = await list_damaged_positions(db_session, branch_id=branch.id)
    assert len(rows) == 1
    assert rows[0].qty_damaged == 10

    await unmark_damaged_position(
        db_session,
        user_id=1,
        idempotency_key=f"unmark-{uuid.uuid4().hex[:8]}",
        branch_id=branch.id,
        product_id=product.id,
        variant_id=pv.id,
        quantity=4,
    )
    await db_session.commit()

    rows2 = await list_damaged_positions(db_session, branch_id=branch.id)
    assert rows2[0].qty_damaged == 6

    sl = (
        await db_session.execute(
            select(StockLevel).where(
                StockLevel.branch_id == branch.id,
                StockLevel.product_id == product.id,
                StockLevel.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert sl.on_hand == 50
    assert sl.damaged == 6
    assert sl.on_hand - sl.reserved - sl.damaged == 44

    await scrap_damaged_position(
        db_session,
        user_id=1,
        idempotency_key=f"scrap-{uuid.uuid4().hex[:8]}",
        branch_id=branch.id,
        product_id=product.id,
        variant_id=pv.id,
        quantity=6,
    )
    await db_session.commit()

    rows3 = await list_damaged_positions(db_session, branch_id=branch.id)
    assert len(rows3) == 0
    sl2 = (
        await db_session.execute(
            select(StockLevel).where(
                StockLevel.branch_id == branch.id,
                StockLevel.product_id == product.id,
                StockLevel.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert sl2.on_hand == 44
    assert sl2.damaged == 0


def test_stock_count_pdf_builds_bytes_en() -> None:
    pdf = build_stock_count_pdf(
        branch_name="Main",
        responsible_name="Admin",
        locale="en",
        rows=[
            {
                "product_name": "Shirt",
                "variant_name": "Red",
                "reference_code": "C-1",
                "on_hand": 10,
                "reserved": 2,
                "uom_label": "Piece",
            }
        ],
    )
    assert pdf[:4] == b"%PDF"
    assert b"Unit" in pdf or b"Unit" in pdf


def test_stock_count_pdf_builds_bytes_ar() -> None:
    pdf = build_stock_count_pdf(
        branch_name="الفرع الرئيسي",
        responsible_name="أحمد",
        locale="ar",
        rows=[
            {
                "product_name": "قميص",
                "variant_name": "أحمر",
                "reference_code": "C-1",
                "on_hand": 10,
                "reserved": 2,
                "uom_label": "قطعة",
            }
        ],
    )
    assert pdf[:4] == b"%PDF"
    assert "الوحدة".encode() in pdf
    assert "ورقة".encode() in pdf
