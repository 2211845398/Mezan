"""Goods receipt creates AP open items (idempotent)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.accounting_settings import AccountingSettings
from app.models.ap_open_item import ApOpenItem
from app.models.branch import Branch
from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.services.goods_receipt_service import receive_goods_for_purchase_order
from app.services.purchase_order_service import create_po, mark_po_sent
from app.services.seed_service import seed_accounting_defaults
from app.services.subledger_service import (
    backfill_ap_open_items_from_goods_receipts,
    ensure_ap_open_item_for_goods_receipt,
    find_ap_open_item_by_source,
)
from app.services.supplier_service import create_supplier


async def _gr_fixture(db_session):
    await seed_accounting_defaults(db_session)
    settings = await db_session.get(AccountingSettings, 1)
    assert settings is not None

    supplier = await create_supplier(
        db_session,
        code=f"SUP-{uuid.uuid4().hex[:8]}",
        first_name="GR",
        father_name=None,
        family_name="Vendor",
        currency_id=settings.base_currency_id,
        contact={"email": "gr-vendor@example.com"},
    )

    branch = Branch(
        name="GR Branch",
        code=f"GB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="GR Cat",
        slug=f"gc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="GR Product",
        sku=f"gp-{uuid.uuid4().hex[:6]}",
        status="active",
        standard_cost=Decimal("5"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()
    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(variant)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_id": supplier.id,
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 3}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    return supplier, branch, po, variant


@pytest.mark.asyncio
async def test_goods_receipt_creates_ap_open_item(db_session) -> None:
    supplier, branch, po, variant = await _gr_fixture(db_session)
    pol_id = po.lines[0].id

    receipt, _ = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 3, "unit_cost": Decimal("20")}],
        idempotency_key=f"gr-ap-{uuid.uuid4().hex}",
        created_by_user_id=None,
    )

    item = await find_ap_open_item_by_source(
        db_session,
        source_type="goods_receipt",
        source_id=str(receipt.id),
    )
    assert item is not None
    assert item.supplier_id == supplier.id
    assert item.amount_total == Decimal("60.00")
    assert item.amount_open == Decimal("60.00")
    assert item.status == "open"


@pytest.mark.asyncio
async def test_ensure_ap_open_item_idempotent(db_session) -> None:
    supplier, branch, po, variant = await _gr_fixture(db_session)
    pol_id = po.lines[0].id

    receipt, _ = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 2, "unit_cost": Decimal("15")}],
        idempotency_key=f"gr-idem-{uuid.uuid4().hex}",
        created_by_user_id=None,
    )

    first = await find_ap_open_item_by_source(
        db_session,
        source_type="goods_receipt",
        source_id=str(receipt.id),
    )
    assert first is not None

    again = await ensure_ap_open_item_for_goods_receipt(db_session, receipt=receipt)
    assert again is not None
    assert again.id == first.id

    res = await db_session.execute(
        select(ApOpenItem).where(
            ApOpenItem.source_type == "goods_receipt",
            ApOpenItem.source_id == str(receipt.id),
        )
    )
    assert len(list(res.scalars().all())) == 1


@pytest.mark.asyncio
async def test_backfill_ap_open_items_from_goods_receipts(db_session) -> None:
    supplier, branch, po, variant = await _gr_fixture(db_session)
    pol_id = po.lines[0].id

    receipt, _ = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 1, "unit_cost": Decimal("40")}],
        idempotency_key=f"gr-bf-{uuid.uuid4().hex}",
        created_by_user_id=None,
    )

    item = await find_ap_open_item_by_source(
        db_session,
        source_type="goods_receipt",
        source_id=str(receipt.id),
    )
    assert item is not None
    await db_session.delete(item)
    await db_session.commit()

    created = await backfill_ap_open_items_from_goods_receipts(db_session)
    await db_session.commit()
    assert created >= 1

    restored = await find_ap_open_item_by_source(
        db_session,
        source_type="goods_receipt",
        source_id=str(receipt.id),
    )
    assert restored is not None
    assert restored.amount_total == Decimal("40.00")
