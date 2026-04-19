import uuid
from datetime import UTC, date, datetime, time, timedelta
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
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _get_branch(db_session, code: str) -> Branch:
    result = await db_session.execute(select(Branch).where(Branch.code == code))
    return result.scalar_one()


async def _get_account(db_session, code: str) -> ChartAccount:
    result = await db_session.execute(select(ChartAccount).where(ChartAccount.code == code))
    return result.scalar_one()


async def _create_category(db_session, *, name: str) -> Category:
    category = Category(
        name=name,
        slug=_unique("category"),
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()
    return category


async def _create_product(db_session, *, category_id: int, name: str) -> Product:
    product = Product(
        category_id=category_id,
        name=name,
        sku=_unique("sku"),
        status="active",
        attributes={},
    )
    db_session.add(product)
    await db_session.flush()
    return product


async def _create_terminal(db_session, *, branch_id: int) -> POSTerminal:
    terminal = POSTerminal(
        branch_id=branch_id,
        name=_unique("terminal"),
        terminal_code=_unique("terminal-code"),
        api_key_hash="test-api-key-hash",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()
    return terminal


async def _create_sales_invoice(
    db_session,
    *,
    branch_id: int,
    terminal_id: int,
    product_id: int,
    created_at: datetime,
    total: Decimal,
) -> SalesInvoice:
    cart = PosCart(
        terminal_id=terminal_id,
        branch_id=branch_id,
        status="paid",
        subtotal=total,
        discount_total=Decimal("0.00"),
        total=total,
        paid_at=created_at,
    )
    db_session.add(cart)
    await db_session.flush()

    invoice = SalesInvoice(
        invoice_number=_unique("INV"),
        invoice_barcode=_unique("BAR"),
        cart_id=cart.id,
        terminal_id=terminal_id,
        branch_id=branch_id,
        subtotal=total,
        discount_total=Decimal("0.00"),
        total=total,
        created_at=created_at,
    )
    db_session.add(invoice)
    await db_session.flush()

    db_session.add(
        SalesInvoiceLine(
            sales_invoice_id=invoice.id,
            product_id=product_id,
            qty=1,
            unit_price=total,
            line_total=total,
        )
    )
    await db_session.flush()
    return invoice


@pytest.mark.asyncio
async def test_income_statement_includes_entries_on_period_end(
    client,
    db_session,
    admin_auth_header,
):
    branch = await _get_branch(db_session, "ST1")
    cash_account = await _get_account(db_session, "1000")
    revenue_account = await _get_account(db_session, "4000")
    period_end = date.today()
    amount = Decimal("125.00")

    journal = JournalEntry(
        entry_date=period_end,
        description="Same-day revenue regression guard",
        source_type="test",
        source_id=_unique("income-statement"),
        idempotency_key=_unique("income-statement"),
    )
    db_session.add(journal)
    await db_session.flush()

    db_session.add_all(
        [
            JournalEntryLine(
                journal_entry_id=journal.id,
                line_no=1,
                account_id=cash_account.id,
                branch_id=branch.id,
                debit=amount,
                credit=Decimal("0.00"),
            ),
            JournalEntryLine(
                journal_entry_id=journal.id,
                line_no=2,
                account_id=revenue_account.id,
                branch_id=branch.id,
                debit=Decimal("0.00"),
                credit=amount,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(
        "/api/v1/accounting/income-statement",
        headers=admin_auth_header,
        params={
            "period_start": period_end.isoformat(),
            "period_end": period_end.isoformat(),
        },
    )
    assert response.status_code == 200, response.text

    payload = response.json()
    assert Decimal(str(payload["total_revenue"])) == amount
    assert Decimal(str(payload["net_income"])) == amount


@pytest.mark.asyncio
async def test_top_products_treats_midnight_period_end_as_calendar_day(
    client,
    db_session,
    admin_auth_header,
):
    branch = await _get_branch(db_session, "ST1")
    category = await _create_category(db_session, name=_unique("Analytics"))
    included_product = await _create_product(
        db_session,
        category_id=category.id,
        name=_unique("Included"),
    )
    excluded_product = await _create_product(
        db_session,
        category_id=category.id,
        name=_unique("Excluded"),
    )
    terminal = await _create_terminal(db_session, branch_id=branch.id)

    target_day = date.today()
    boundary = datetime.combine(target_day, time.min, tzinfo=UTC)
    included_created_at = datetime.combine(target_day, time(23, 30), tzinfo=UTC)
    excluded_created_at = datetime.combine(target_day + timedelta(days=1), time(9, 0), tzinfo=UTC)

    await _create_sales_invoice(
        db_session,
        branch_id=branch.id,
        terminal_id=terminal.id,
        product_id=included_product.id,
        created_at=included_created_at,
        total=Decimal("50.00"),
    )
    await _create_sales_invoice(
        db_session,
        branch_id=branch.id,
        terminal_id=terminal.id,
        product_id=excluded_product.id,
        created_at=excluded_created_at,
        total=Decimal("80.00"),
    )
    await db_session.commit()

    response = await client.get(
        "/api/v1/marketing/analytics/top-products",
        headers=admin_auth_header,
        params={
            "limit": 10,
            "period_start": boundary.isoformat(),
            "period_end": boundary.isoformat(),
        },
    )
    assert response.status_code == 200, response.text

    items = response.json()["items"]
    names = {item["product_name"] for item in items}
    revenue_by_name = {
        item["product_name"]: Decimal(str(item["total_revenue"]))
        for item in items
    }

    assert included_product.name in names
    assert excluded_product.name not in names
    assert revenue_by_name[included_product.name] == Decimal("50.00")
