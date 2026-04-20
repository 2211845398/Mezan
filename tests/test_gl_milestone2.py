"""Milestone 2 GL: AR cash receipt on apply; settings include clearing/discount accounts."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.accounting_settings import AccountingSettings
from app.models.ar_open_item import ArOpenItem
from app.models.branch import Branch
from app.models.journal_entries import JournalEntry
from app.services.seed_service import seed_accounting_defaults
from app.services.subledger_service import apply_ar_payment


@pytest.mark.asyncio
async def test_apply_ar_payment_posts_cash_vs_ar_journal(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="GL2 Branch",
        code=f"G2-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()
    item = ArOpenItem(
        branch_id=branch.id,
        customer_id=None,
        source_type="manual",
        source_id="x1",
        description="test",
        document_date=date.today(),
        due_date=None,
        currency_code="USD",
        amount_total=Decimal("40.00"),
        amount_open=Decimal("40.00"),
        status="open",
    )
    db_session.add(item)
    await db_session.flush()

    app = await apply_ar_payment(
        db_session,
        ar_open_item_id=item.id,
        amount=Decimal("25.00"),
        reference="CHK-1",
        note=None,
        created_by_user_id=None,
    )
    await db_session.commit()

    je_res = await db_session.execute(
        select(JournalEntry).where(JournalEntry.idempotency_key == f"ar_payment_application:{app.id}")
    )
    je = je_res.scalar_one_or_none()
    assert je is not None
    assert je.source_type == "ar_payment_application"


@pytest.mark.asyncio
async def test_accounting_settings_has_clearing_and_discount_accounts(db_session) -> None:
    await seed_accounting_defaults(db_session)
    res = await db_session.execute(select(AccountingSettings).where(AccountingSettings.id == 1))
    s = res.scalar_one()
    assert s.default_card_clearing_account_id
    assert s.default_other_clearing_account_id
    assert s.default_sales_discount_account_id
