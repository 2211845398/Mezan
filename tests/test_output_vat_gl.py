"""Milestone 3: output VAT payable on POS sale GL and return reversal."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models.branch import Branch
from app.models.category import Category
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.pos_cart import PosCart
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sales_invoice import InvoicePayment, SalesInvoice, SalesInvoiceLine
from app.models.users import User
from app.services.accounting_service import get_accounting_settings
from app.services.document_posting_service import post_sales_invoice_gl, post_sales_return_gl
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_walk_in_sale_posts_credit_to_output_vat_payable(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="VAT Branch",
        code=f"V-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"v-{uuid.uuid4().hex[:8]}@example.com",
        first_name="VAT",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([branch, user])
    await db_session.flush()

    terminal = POSTerminal(
        branch_id=branch.id,
        name="VAT T",
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
        name="VAT Cat",
        slug=f"vc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="VAT SKU",
        sku=f"vk-{uuid.uuid4().hex[:8]}",
        status="active",
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

    settings = await get_accounting_settings(db_session)
    je_res = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.idempotency_key == f"sales_invoice:{invoice.id}:pos_cash"
        )
    )
    je = je_res.scalar_one()
    tax_credit = await db_session.scalar(
        select(func.coalesce(func.sum(JournalEntryLine.credit), Decimal("0"))).where(
            JournalEntryLine.journal_entry_id == je.id,
            JournalEntryLine.account_id == settings.default_output_tax_payable_account_id,
        )
    )
    assert tax_credit == Decimal("15.00")


@pytest.mark.asyncio
async def test_sales_return_debits_output_vat_payable(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="VAT Ret",
        code=f"VR-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"vr-{uuid.uuid4().hex[:8]}@example.com",
        first_name="VRet",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([branch, user])
    await db_session.flush()
    terminal = POSTerminal(
        branch_id=branch.id,
        name="VRT",
        terminal_code=f"VRT-{uuid.uuid4().hex[:8]}",
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
        name="VRC",
        slug=f"vrc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="VRP",
        sku=f"vrp-{uuid.uuid4().hex[:8]}",
        status="active",
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
    invoice = SalesInvoice(
        invoice_number=f"INVR-{uuid.uuid4().hex[:8]}",
        invoice_barcode=f"BCR-{uuid.uuid4().hex[:8]}",
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

    ret_id = int(uuid.uuid4().hex[:8], 16) % 1_000_000_000
    await post_sales_return_gl(
        db_session,
        branch_id=branch.id,
        credit_total=Decimal("115.00"),
        sales_invoice_id=invoice.id,
        sales_return_id=ret_id,
        lines=[(product.id, 1, Decimal("115.00"), pv.id)],
    )
    await db_session.commit()

    settings = await get_accounting_settings(db_session)
    je_res = await db_session.execute(
        select(JournalEntry).where(JournalEntry.idempotency_key == f"sales_return:{ret_id}:revenue")
    )
    je = je_res.scalar_one()
    tax_debit = await db_session.scalar(
        select(func.coalesce(func.sum(JournalEntryLine.debit), Decimal("0"))).where(
            JournalEntryLine.journal_entry_id == je.id,
            JournalEntryLine.account_id == settings.default_output_tax_payable_account_id,
        )
    )
    assert tax_debit == Decimal("15.00")
