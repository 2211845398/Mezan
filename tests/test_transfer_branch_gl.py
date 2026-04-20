"""Milestone 4: inter-branch receive posts inventory GL and updates destination WAVG."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.branch import Branch
from app.models.branch_product_costs import BranchProductCost
from app.models.category import Category
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.product import Product
from app.services.accounting_service import get_accounting_settings
from app.services.inventory_service import apply_stock_movement
from app.services.inventory_valuation_service import apply_receipt_to_weighted_average
from app.services.seed_service import seed_accounting_defaults
from app.services.transfer_service import create_batch, dispatch_batch, receive_batch


@pytest.mark.asyncio
async def test_transfer_receive_posts_inter_branch_inventory_journal(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await get_accounting_settings(db_session)

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

    # Source branch: 40 units @ 7.50 WAVG
    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed:{product.id}:from",
        branch_id=b_from.id,
        product_id=product.id,
        qty_delta=40,
        reason="test_seed",
        ref_type="test",
        ref_id="1",
    )
    await apply_receipt_to_weighted_average(
        db_session,
        branch_id=b_from.id,
        product_id=product.id,
        qty_in=40,
        unit_cost=Decimal("7.50"),
        qty_on_hand_before=0,
    )
    await db_session.commit()

    batch = await create_batch(
        db_session,
        created_by_user_id=None,
        data={
            "from_branch_id": b_from.id,
            "to_branch_id": b_to.id,
            "lines": [{"product_id": product.id, "qty": 12}],
        },
    )
    await dispatch_batch(db_session, batch_id=batch.id)
    await receive_batch(db_session, batch_id=batch.id)

    je_res = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.idempotency_key == f"transfer_batch:{batch.id}:receive_gl"
        )
    )
    je = je_res.scalar_one_or_none()
    assert je is not None
    assert je.source_type == "transfer_batch"
    assert je.source_id == str(batch.id)

    lines_res = await db_session.execute(
        select(JournalEntryLine)
        .where(JournalEntryLine.journal_entry_id == je.id)
        .order_by(JournalEntryLine.line_no)
    )
    glines = list(lines_res.scalars().all())
    assert len(glines) == 2
    ext = Decimal("12") * Decimal("7.50")
    dr = next(x for x in glines if x.debit > 0)
    cr = next(x for x in glines if x.credit > 0)
    assert dr.branch_id == b_to.id
    assert cr.branch_id == b_from.id
    assert dr.account_id == settings.default_inventory_account_id
    assert cr.account_id == settings.default_inventory_account_id
    assert dr.debit == ext
    assert cr.credit == ext

    cost_res = await db_session.execute(
        select(BranchProductCost).where(
            BranchProductCost.branch_id == b_to.id,
            BranchProductCost.product_id == product.id,
        )
    )
    row = cost_res.scalar_one_or_none()
    assert row is not None
    assert row.average_unit_cost == Decimal("7.5000")
