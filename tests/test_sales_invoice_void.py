"""Milestone 6: void POS sales invoice — GL reversal, stock restore, guards."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.category import Category
from app.models.journal_entries import JournalEntry
from app.models.pos_cart import PosCart
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sales_invoice import InvoicePayment, SalesInvoice, SalesInvoiceLine
from app.models.stock_level import StockLevel
from app.models.users import User
from app.services.document_posting_service import post_sales_invoice_gl
from app.services.inventory_service import apply_stock_movement
from app.services.invoice_service import void_sales_invoice
from app.services.returns_service import create_return_and_credit
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_void_reverses_journal_and_restores_stock(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="Void Branch",
        code=f"V-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"v-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Void",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([branch, user])
    await db_session.flush()

    terminal = POSTerminal(
        branch_id=branch.id,
        name="Void T",
        terminal_code=f"VT-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()

    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=None,
        customer_id=None,
        status="paid",
        subtotal=Decimal("100.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("15.00"),
        total=Decimal("115.00"),
    )
    db_session.add(cart)
    await db_session.flush()

    category = Category(
        name="Void Cat",
        slug=f"vc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="Void SKU",
        sku=f"vk-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
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

    db_session.add(
        StockLevel(
            branch_id=branch.id, product_id=product.id, variant_id=pv.id, on_hand=10, reserved=0
        )
    )
    await db_session.flush()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"sale:{uuid.uuid4().hex}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=-1,
        reason="sale",
        ref_type="sales_invoice",
        ref_id="pending",
        variant_id=pv.id,
    )
    await db_session.commit()

    invoice = SalesInvoice(
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        invoice_barcode=f"BC-{uuid.uuid4().hex[:8]}",
        cart_id=cart.id,
        terminal_id=terminal.id,
        branch_id=branch.id,
        customer_id=None,
        subtotal=Decimal("100.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("15.00"),
        total=Decimal("115.00"),
        created_by_user_id=user.id,
    )
    db_session.add(invoice)
    await db_session.flush()

    line = SalesInvoiceLine(
        sales_invoice_id=invoice.id,
        product_id=product.id,
        variant_id=pv.id,
        qty=1,
        unit_price=Decimal("100.00"),
        line_total=Decimal("100.00"),
        tax_rate=Decimal("0.15"),
        line_tax_amount=Decimal("15.00"),
    )
    db_session.add(line)
    db_session.add(
        InvoicePayment(
            sales_invoice_id=invoice.id,
            payment_intent_id=None,
            amount=Decimal("115.00"),
            method="cash",
            reference=None,
        )
    )
    await db_session.flush()

    await post_sales_invoice_gl(db_session, invoice=invoice, lines=[line])
    await db_session.commit()

    level_before = (
        await db_session.execute(
            select(StockLevel.on_hand).where(
                StockLevel.branch_id == branch.id,
                StockLevel.product_id == product.id,
                StockLevel.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert level_before == 9

    je_count_before = await db_session.scalar(
        select(func.count())
        .select_from(JournalEntry)
        .where(
            JournalEntry.source_type == "sales_invoice",
            JournalEntry.source_id == str(invoice.id),
        )
    )

    voided = await void_sales_invoice(
        db_session,
        invoice_id=invoice.id,
        invoice_barcode=None,
        reason="test void",
        actor_user_id=user.id,
    )
    assert voided.voided_at is not None
    assert voided.void_reason == "test void"

    rev_count = await db_session.scalar(
        select(func.count())
        .select_from(JournalEntry)
        .where(JournalEntry.reverses_entry_id.isnot(None))
    )
    assert rev_count >= je_count_before

    level_after = (
        await db_session.execute(
            select(StockLevel.on_hand).where(
                StockLevel.branch_id == branch.id,
                StockLevel.product_id == product.id,
                StockLevel.variant_id == pv.id,
            )
        )
    ).scalar_one()
    assert level_after == 10


@pytest.mark.asyncio
async def test_void_is_idempotent(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="Void2",
        code=f"V2-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"v2-{uuid.uuid4().hex[:8]}@example.com",
        first_name="V2",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([branch, user])
    await db_session.flush()
    terminal = POSTerminal(
        branch_id=branch.id,
        name="V2T",
        terminal_code=f"V2T-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()
    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=None,
        customer_id=None,
        status="paid",
        subtotal=Decimal("10.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("10.00"),
    )
    db_session.add(cart)
    await db_session.flush()
    category = Category(
        name="V2c",
        slug=f"v2-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="V2p",
        sku=f"v2p-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()
    pv2 = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv2)
    await db_session.flush()
    db_session.add(
        StockLevel(
            branch_id=branch.id, product_id=product.id, variant_id=pv2.id, on_hand=5, reserved=0
        )
    )
    await db_session.flush()
    await apply_stock_movement(
        db_session,
        idempotency_key=f"s2:{uuid.uuid4().hex}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=-1,
        reason="sale",
        ref_type="sales_invoice",
        ref_id="x",
        variant_id=pv2.id,
    )
    await db_session.commit()

    invoice = SalesInvoice(
        invoice_number=f"I2-{uuid.uuid4().hex[:8]}",
        invoice_barcode=f"B2-{uuid.uuid4().hex[:8]}",
        cart_id=cart.id,
        terminal_id=terminal.id,
        branch_id=branch.id,
        customer_id=None,
        subtotal=Decimal("10.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("10.00"),
        created_by_user_id=user.id,
    )
    db_session.add(invoice)
    await db_session.flush()
    ln = SalesInvoiceLine(
        sales_invoice_id=invoice.id,
        product_id=product.id,
        variant_id=pv2.id,
        qty=1,
        unit_price=Decimal("10.00"),
        line_total=Decimal("10.00"),
        tax_rate=Decimal("0"),
        line_tax_amount=Decimal("0.00"),
    )
    db_session.add(ln)
    db_session.add(
        InvoicePayment(
            sales_invoice_id=invoice.id,
            payment_intent_id=None,
            amount=Decimal("10.00"),
            method="cash",
            reference=None,
        )
    )
    await db_session.flush()
    await post_sales_invoice_gl(db_session, invoice=invoice, lines=[ln])
    await db_session.commit()

    first = await void_sales_invoice(
        db_session,
        invoice_id=invoice.id,
        invoice_barcode=None,
        reason="r",
        actor_user_id=user.id,
    )
    second = await void_sales_invoice(
        db_session,
        invoice_id=invoice.id,
        invoice_barcode=None,
        reason="r",
        actor_user_id=user.id,
    )
    assert first.id == second.id
    assert second.voided_at is not None


@pytest.mark.asyncio
async def test_return_rejected_for_voided_invoice(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="Void3",
        code=f"V3-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"v3-{uuid.uuid4().hex[:8]}@example.com",
        first_name="V3",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([branch, user])
    await db_session.flush()
    terminal = POSTerminal(
        branch_id=branch.id,
        name="V3T",
        terminal_code=f"V3T-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()
    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=None,
        customer_id=None,
        status="paid",
        subtotal=Decimal("10.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("10.00"),
    )
    db_session.add(cart)
    await db_session.flush()
    category = Category(
        name="V3c",
        slug=f"v3-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="V3p",
        sku=f"v3p-{uuid.uuid4().hex[:8]}",
        status="active",
        attributes={},
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()
    pv3 = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(pv3)
    await db_session.flush()
    db_session.add(
        StockLevel(
            branch_id=branch.id, product_id=product.id, variant_id=pv3.id, on_hand=3, reserved=0
        )
    )
    await db_session.flush()
    await apply_stock_movement(
        db_session,
        idempotency_key=f"s3:{uuid.uuid4().hex}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=-1,
        reason="sale",
        ref_type="sales_invoice",
        ref_id="y",
        variant_id=pv3.id,
    )
    await db_session.commit()

    barcode = f"B3-{uuid.uuid4().hex[:8]}"
    invoice = SalesInvoice(
        invoice_number=f"I3-{uuid.uuid4().hex[:8]}",
        invoice_barcode=barcode,
        cart_id=cart.id,
        terminal_id=terminal.id,
        branch_id=branch.id,
        customer_id=None,
        subtotal=Decimal("10.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("10.00"),
        created_by_user_id=user.id,
    )
    db_session.add(invoice)
    await db_session.flush()
    ln = SalesInvoiceLine(
        sales_invoice_id=invoice.id,
        product_id=product.id,
        variant_id=pv3.id,
        qty=1,
        unit_price=Decimal("10.00"),
        line_total=Decimal("10.00"),
        tax_rate=Decimal("0"),
        line_tax_amount=Decimal("0.00"),
    )
    db_session.add(ln)
    db_session.add(
        InvoicePayment(
            sales_invoice_id=invoice.id,
            payment_intent_id=None,
            amount=Decimal("10.00"),
            method="cash",
            reference=None,
        )
    )
    await db_session.flush()
    await post_sales_invoice_gl(db_session, invoice=invoice, lines=[ln])
    await db_session.commit()

    await void_sales_invoice(
        db_session,
        invoice_id=invoice.id,
        invoice_barcode=None,
        reason="void before return",
        actor_user_id=user.id,
    )

    with pytest.raises(ValidationError, match="voided"):
        await create_return_and_credit(
            db_session,
            invoice_barcode=barcode,
            lines=[{"sales_invoice_line_id": ln.id, "qty": 1}],
            reason=None,
            exchange_cart_id=None,
            user_id=user.id,
        )
