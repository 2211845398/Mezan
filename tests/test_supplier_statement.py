"""Supplier AP statement and evaluation."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.accounting_settings import AccountingSettings
from app.models.branch import Branch
from app.models.category import Category
from app.models.chart_accounts import ChartAccount
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.suppliers import Supplier
from app.services.goods_receipt_service import receive_goods_for_purchase_order
from app.services.purchase_order_service import create_po, mark_po_sent
from app.services.seed_service import seed_accounting_defaults
from app.services.subledger_service import apply_ap_payment, create_ap_open_item
from app.services.supplier_statement_service import get_supplier_evaluation, get_supplier_statement
from app.services.supplier_service import create_supplier


@pytest.mark.asyncio
async def test_supplier_statement_gr_and_payment(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await db_session.get(AccountingSettings, 1)
    assert settings is not None

    ap_res = await db_session.execute(select(ChartAccount).where(ChartAccount.code == "2010"))
    ap_leaf = ap_res.scalar_one()

    supplier = await create_supplier(
        db_session,
        first_name="Stmt",
        father_name=None,
        family_name="Vendor",
        currency_id=settings.base_currency_id,
        payables_account_id=ap_leaf.id,
        contact={},
    )

    branch = Branch(
        name="Stmt Branch",
        code=f"SB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="Stmt Cat",
        slug=f"sc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Stmt Product",
        sku=f"sp-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
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
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 4}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    receipt, _ = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 4, "unit_cost": Decimal("25")}],
        idempotency_key=f"gr-stmt-{uuid.uuid4().hex}",
        created_by_user_id=None,
    )
    assert receipt.supplier_id == supplier.id

    ap_item = await create_ap_open_item(
        db_session,
        data={
            "branch_id": branch.id,
            "supplier_id": supplier.id,
            "source_type": "manual_invoice",
            "source_id": "INV-TEST-1",
            "description": "Manual supplier invoice",
            "document_date": date.today(),
            "amount_total": Decimal("50.00"),
            "currency_code": "USD",
        },
    )
    await db_session.commit()

    await apply_ap_payment(
        db_session,
        ap_open_item_id=ap_item.id,
        amount=Decimal("30.00"),
        reference="PV-001",
        note=None,
        created_by_user_id=None,
    )
    await db_session.commit()

    stmt = await get_supplier_statement(
        db_session,
        supplier_id=supplier.id,
        date_from=date(2020, 1, 1),
        date_to=date(2099, 12, 31),
        branch_id=branch.id,
    )
    assert stmt.closing_balance > Decimal("0")
    assert len(stmt.lines) >= 2
    credits = [ln for ln in stmt.lines if ln.credit > 0]
    debits = [ln for ln in stmt.lines if ln.debit > 0]
    assert credits
    assert debits
    assert stmt.lines[-1].running_balance == stmt.closing_balance

    ev = await get_supplier_evaluation(
        db_session,
        supplier_id=supplier.id,
        period_days=365,
        branch_id=branch.id,
    )
    assert ev.receipt_count >= 1
    assert ev.payment_count >= 1
    assert ev.total_purchases > Decimal("0")
