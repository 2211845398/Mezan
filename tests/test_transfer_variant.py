"""Transfer batch creation with explicit variant_id validation."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.transfer_line import TransferLine
from app.services.inventory_service import apply_stock_movement
from app.services.transfer_service import create_batch


@pytest.mark.asyncio
async def test_create_batch_rejects_variant_not_matching_product(db_session) -> None:
    b_from = Branch(
        name="TV From",
        code=f"VF-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    b_to = Branch(
        name="TV To",
        code=f"VT-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add_all([b_from, b_to])
    await db_session.flush()

    category = Category(
        name="TV Cat",
        slug=f"tc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    p1 = Product(
        category_id=category.id,
        name="Product One",
        sku=f"p1-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
        output_vat_rate=Decimal("0"),
    )
    p2 = Product(
        category_id=category.id,
        name="Product Two",
        sku=f"p2-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add_all([p1, p2])
    await db_session.flush()

    v1 = ProductVariant(product_id=p1.id, sku=f"{p1.sku}-A", attribute_values={"color": "red"}, active=True)
    v2 = ProductVariant(product_id=p2.id, sku=f"{p2.sku}-B", attribute_values={}, active=True)
    db_session.add_all([v1, v2])
    await db_session.flush()

    with pytest.raises(ValidationError, match="variant_id"):
        await create_batch(
            db_session,
            created_by_user_id=None,
            data={
                "from_branch_id": b_from.id,
                "to_branch_id": b_to.id,
                "lines": [{"product_id": p1.id, "variant_id": v2.id, "qty": 1}],
            },
        )


@pytest.mark.asyncio
async def test_create_batch_persists_explicit_variant(db_session) -> None:
    b_from = Branch(
        name="TV From2",
        code=f"VF2-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    b_to = Branch(
        name="TV To2",
        code=f"VT2-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add_all([b_from, b_to])
    await db_session.flush()

    category = Category(
        name="TV Cat2",
        slug=f"tc2-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Dual Var Product",
        sku=f"dv-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("1.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    va = ProductVariant(product_id=product.id, sku=f"{product.sku}-A", attribute_values={"size": "S"}, active=True)
    vb = ProductVariant(product_id=product.id, sku=f"{product.sku}-B", attribute_values={"size": "L"}, active=True)
    db_session.add_all([va, vb])
    await db_session.flush()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"tv:{product.id}:a",
        branch_id=b_from.id,
        product_id=product.id,
        qty_delta=5,
        reason="test_seed",
        ref_type="test",
        ref_id="1",
        variant_id=va.id,
    )
    await db_session.commit()

    batch = await create_batch(
        db_session,
        created_by_user_id=None,
        data={
            "from_branch_id": b_from.id,
            "to_branch_id": b_to.id,
            "lines": [{"product_id": product.id, "variant_id": va.id, "qty": 2}],
        },
    )
    res = await db_session.execute(select(TransferLine).where(TransferLine.transfer_batch_id == batch.id))
    line = res.scalars().first()
    assert line is not None
    assert line.variant_id == va.id
    assert line.product_id == product.id
    assert line.qty == 2
