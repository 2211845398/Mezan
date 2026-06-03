"""Branch/terminal cash provisioning and settlement routing (Phase 3)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.branch import Branch
from app.models.category import Category
from app.models.chart_accounts import ChartAccount
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.pos_cart import PosCart
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sales_invoice import InvoicePayment, SalesInvoice, SalesInvoiceLine
from app.models.users import User
from app.services.accounting_service import get_accounting_settings
from app.services.branch_accounting_service import (
    ensure_branch_cash_account,
    ensure_terminal_cash_account,
    provision_branch_accounting,
    resolve_settlement_account_id,
)
from app.services.customer_crm_service import create_staff_customer
from app.services.document_posting_service import post_sales_invoice_gl
from app.services.seed_service import seed_accounting_defaults
from app.services.supplier_service import create_supplier


@pytest.mark.asyncio
async def test_provision_branch_cash_under_10100(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="Cash Branch",
        code=f"CB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cash = await provision_branch_accounting(db_session, branch_id=branch.id)
    parent = await db_session.get(ChartAccount, cash.parent_id)
    assert parent is not None
    assert parent.code == "10100"
    assert cash.branch_id == branch.id
    assert cash.pos_terminal_id is None
    assert cash.code.startswith("CASH-")


@pytest.mark.asyncio
async def test_terminal_cash_distinct_from_branch_cash(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="POS Branch",
        code=f"PB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()
    branch_cash = await ensure_branch_cash_account(db_session, branch.id)

    terminal = POSTerminal(
        branch_id=branch.id,
        name="Register 1",
        terminal_code=f"T-{uuid.uuid4().hex[:8]}",
        api_key_hash="x",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()

    term_cash = await ensure_terminal_cash_account(db_session, terminal.id)
    assert term_cash.id != branch_cash.id
    assert term_cash.pos_terminal_id == terminal.id
    assert term_cash.branch_id == branch.id


@pytest.mark.asyncio
async def test_resolve_settlement_prefers_terminal_cash(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await get_accounting_settings(db_session)
    branch = Branch(
        name="Settle Branch",
        code=f"SB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()
    branch_cash = await ensure_branch_cash_account(db_session, branch.id)

    terminal = POSTerminal(
        branch_id=branch.id,
        name="Reg",
        terminal_code=f"ST-{uuid.uuid4().hex[:8]}",
        api_key_hash="y",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()
    term_cash = await ensure_terminal_cash_account(db_session, terminal.id)

    branch_only = await resolve_settlement_account_id(
        db_session, settings, "cash", branch_id=branch.id
    )
    with_terminal = await resolve_settlement_account_id(
        db_session,
        settings,
        "cash",
        branch_id=branch.id,
        terminal_id=terminal.id,
    )
    assert branch_only == branch_cash.id
    assert with_terminal == term_cash.id


@pytest.mark.asyncio
async def test_create_customer_defaults_ar_account(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await get_accounting_settings(db_session)
    ar = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1110"))
    ).scalar_one()

    customer = await create_staff_customer(
        db_session,
        phone=f"+1{uuid.uuid4().int % 10**10}",
        first_name="Test",
        father_name=None,
        family_name=None,
        email=None,
        is_temporary=False,
        default_currency_id=None,
        receivables_account_id=None,
        created_by_user_id=1,
    )
    assert customer.receivables_account_id == settings.default_ar_account_id == ar.id


@pytest.mark.asyncio
async def test_create_supplier_defaults_ap_account(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await get_accounting_settings(db_session)
    ap = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "2010"))
    ).scalar_one()

    supplier = await create_supplier(
        db_session,
        code=None,
        first_name="Vendor",
        father_name=None,
        family_name=None,
        currency_id=None,
        currency_code="USD",
        payables_account_id=None,
    )
    assert supplier.payables_account_id == settings.default_ap_account_id == ap.id


@pytest.mark.asyncio
async def test_pos_sale_debits_terminal_cash_account(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="GL Branch",
        code=f"GL-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"gl-{uuid.uuid4().hex[:8]}@example.com",
        first_name="GL",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([branch, user])
    await db_session.flush()

    terminal = POSTerminal(
        branch_id=branch.id,
        name="GL T",
        terminal_code=f"GT-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()
    term_cash = await ensure_terminal_cash_account(db_session, terminal.id)

    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=None,
        customer_id=None,
        status="paid",
        subtotal=Decimal("50.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("50.00"),
    )
    db_session.add(cart)
    await db_session.flush()

    category = Category(
        name="GL Cat",
        slug=f"gc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    product = Product(
        category_id=category.id,
        name="GL SKU",
        sku=f"gk-{uuid.uuid4().hex[:8]}",
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
        subtotal=Decimal("50.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("50.00"),
        created_by_user_id=user.id,
    )
    db_session.add(invoice)
    await db_session.flush()
    line = SalesInvoiceLine(
        sales_invoice_id=invoice.id,
        product_id=product.id,
        variant_id=pv.id,
        qty=1,
        unit_price=Decimal("50.00"),
        line_total=Decimal("50.00"),
        tax_rate=Decimal("0"),
        line_tax_amount=Decimal("0"),
    )
    db_session.add(line)
    db_session.add(
        InvoicePayment(
            sales_invoice_id=invoice.id,
            payment_intent_id=None,
            amount=Decimal("50.00"),
            method="cash",
            reference=None,
        )
    )
    await db_session.flush()

    await post_sales_invoice_gl(db_session, invoice=invoice, lines=[line])
    await db_session.commit()

    je = (
        await db_session.execute(
            select(JournalEntry).where(
                JournalEntry.idempotency_key == f"sales_invoice:{invoice.id}:pos_cash"
            )
        )
    ).scalar_one()
    cash_lines = (
        (
            await db_session.execute(
                select(JournalEntryLine).where(
                    JournalEntryLine.journal_entry_id == je.id,
                    JournalEntryLine.account_id == term_cash.id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(cash_lines) == 1
    assert cash_lines[0].debit == Decimal("50.00")
