"""Stock count session lifecycle."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.category import Category
from app.models.stock_count_session import StockCountLine, StockCountSession
from app.models.stock_movement import StockMovement
from app.schemas.stock_count import StockCountLineUpdate
from app.services.catalog_service import create_product
from app.services.inventory_service import apply_stock_movement
from app.services.stock_count_pdf_service import export_stock_count_pdf_from_session
from app.services.stock_count_session_service import (
    create_stock_count_session,
    patch_stock_count_lines,
    post_stock_count_session,
)


@pytest.mark.asyncio
async def test_stock_count_session_create_and_post(db_session) -> None:
    branch = Branch(
        name="Count Branch",
        code=f"CB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(name="Count Cat", slug=f"cc-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Count Product",
            "sku": f"cp-{uuid.uuid4().hex[:6]}",
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
        idempotency_key=f"seed-count:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=10,
        reason="adjustment",
        variant_id=pv.id,
    )

    s1 = await create_stock_count_session(
        db_session,
        user_id=1,
        branch_id=branch.id,
    )
    assert s1.version_no == 1
    assert s1.line_count >= 1

    s2 = await create_stock_count_session(
        db_session,
        user_id=1,
        branch_id=branch.id,
    )
    assert s2.version_no == 2

    target = next(ln for ln in s2.lines if ln.product_id == product.id and ln.variant_id == pv.id)
    updates = [
        StockCountLineUpdate(
            id=ln.id,
            counted_qty=ln.system_on_hand + (3 if ln.id == target.id else 0),
        )
        for ln in s2.lines
    ]
    await patch_stock_count_lines(db_session, session_id=s2.id, updates=updates)

    result = await post_stock_count_session(db_session, user_id=1, session_id=s2.id)
    assert result.movements_posted >= 1

    sess = await db_session.get(StockCountSession, s2.id)
    assert sess is not None
    assert sess.status == "posted"

    mv_res = await db_session.execute(
        select(StockMovement).where(
            StockMovement.movement_kind == "count_adjust",
            StockMovement.reason == "stock_count",
        )
    )
    movements = list(mv_res.scalars().all())
    assert any(m.qty_delta == 3 for m in movements)


@pytest.mark.asyncio
async def test_stock_count_post_requires_all_lines_complete(db_session) -> None:
    branch = Branch(
        name="Incomplete Branch",
        code=f"IC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(name="Incomplete Cat", slug=f"ic-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Incomplete Product",
            "sku": f"ip-{uuid.uuid4().hex[:6]}",
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
        idempotency_key=f"seed-incomplete:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=4,
        reason="adjustment",
        variant_id=pv.id,
    )

    detail = await create_stock_count_session(db_session, user_id=1, branch_id=branch.id)
    line = next(ln for ln in detail.lines if ln.product_id == product.id and ln.variant_id == pv.id)
    await patch_stock_count_lines(
        db_session,
        session_id=detail.id,
        updates=[StockCountLineUpdate(id=line.id, counted_qty=line.system_on_hand)],
    )

    with pytest.raises(ValidationError, match="counted quantity"):
        await post_stock_count_session(db_session, user_id=1, session_id=detail.id)


@pytest.mark.asyncio
async def test_stock_count_post_allows_optional_damaged(db_session) -> None:
    branch = Branch(
        name="Optional Damaged Branch",
        code=f"OD-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(
        name="Optional Damaged Cat",
        slug=f"od-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Optional Damaged Product",
            "sku": f"odp-{uuid.uuid4().hex[:6]}",
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
        idempotency_key=f"seed-optional-damaged:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=6,
        reason="adjustment",
        variant_id=pv.id,
    )

    detail = await create_stock_count_session(db_session, user_id=1, branch_id=branch.id)
    updates = [
        StockCountLineUpdate(id=ln.id, counted_qty=ln.system_on_hand) for ln in detail.lines
    ]
    await patch_stock_count_lines(db_session, session_id=detail.id, updates=updates)

    result = await post_stock_count_session(db_session, user_id=1, session_id=detail.id)
    assert result.movements_posted == 0

    sess = await db_session.get(StockCountSession, detail.id)
    assert sess is not None
    assert sess.status == "posted"


@pytest.mark.asyncio
async def test_stock_count_lines_unique_per_session(db_session) -> None:
    branch = Branch(
        name="Count Branch 2",
        code=f"CB2-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(name="Count Cat 2", slug=f"cc2-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Count Product 2",
            "sku": f"cp2-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-count2:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=5,
        reason="adjustment",
    )

    detail = await create_stock_count_session(
        db_session,
        user_id=1,
        branch_id=branch.id,
    )
    res = await db_session.execute(
        select(StockCountLine).where(StockCountLine.session_id == detail.id)
    )
    lines = list(res.scalars().all())
    keys = {(ln.product_id, ln.variant_id) for ln in lines}
    assert len(keys) == len(lines)


@pytest.mark.asyncio
async def test_stock_count_session_pdf_export(db_session) -> None:
    branch = Branch(
        name="PDF Branch",
        code=f"PDF-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    detail = await create_stock_count_session(
        db_session,
        user_id=1,
        branch_id=branch.id,
        responsible_name="Warehouse Lead",
    )
    pdf_bytes, filename = await export_stock_count_pdf_from_session(
        db_session, session_id=detail.id, locale="en"
    )
    assert pdf_bytes.startswith(b"%PDF")
    assert "stock_count" in filename
    assert detail.line_count >= 0


@pytest.mark.asyncio
async def test_stock_count_category_descendants(db_session) -> None:
    branch = Branch(
        name="Tree Branch",
        code=f"TB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    parent = Category(name="Parent", slug=f"p-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(parent)
    await db_session.flush()
    child = Category(
        name="Child",
        slug=f"c-{uuid.uuid4().hex[:8]}",
        parent_id=parent.id,
        sort_order=0,
        is_active=True,
    )
    db_session.add(child)
    await db_session.flush()

    p_parent = await create_product(
        db_session,
        data={
            "category_id": parent.id,
            "name": "Parent Product",
            "sku": f"pp-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    p_child = await create_product(
        db_session,
        data={
            "category_id": child.id,
            "name": "Child Product",
            "sku": f"cp-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    from app.models.product_variant import ProductVariant

    for prod in (p_parent, p_child):
        pv = (
            await db_session.execute(
                select(ProductVariant).where(ProductVariant.product_id == prod.id).limit(1)
            )
        ).scalar_one()
        await apply_stock_movement(
            db_session,
            idempotency_key=f"seed-tree:{prod.id}",
            branch_id=branch.id,
            product_id=prod.id,
            qty_delta=2,
            reason="adjustment",
            variant_id=pv.id,
        )

    narrow = await create_stock_count_session(
        db_session,
        user_id=1,
        branch_id=branch.id,
        category_id=parent.id,
        category_include_descendants=False,
    )
    wide = await create_stock_count_session(
        db_session,
        user_id=1,
        branch_id=branch.id,
        category_id=parent.id,
        category_include_descendants=True,
    )
    assert wide.line_count >= narrow.line_count
    assert wide.line_count >= 2
