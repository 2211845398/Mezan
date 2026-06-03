"""PATCH journal entry updates."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.chart_accounts import ChartAccount
from app.services.accounting_service import post_journal_entry, update_journal_entry
from app.services.journal_inquiry_service import get_journal_entry_detail
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_update_manual_journal_entry(db_session) -> None:
    await seed_accounting_defaults(db_session)
    cash = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1000"))
    ).scalar_one()
    revenue = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "4000"))
    ).scalar_one()

    branch = Branch(
        name="JE Update Branch",
        code=f"JUB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    je = await post_journal_entry(
        db_session,
        entry_date=date.today(),
        description="before",
        source_type="manual",
        source_id=f"upd-{uuid.uuid4().hex[:8]}",
        idempotency_key=f"upd-key-{uuid.uuid4().hex}",
        lines=[
            {
                "account_id": cash.id,
                "branch_id": branch.id,
                "debit": Decimal("100"),
                "credit": Decimal("0"),
            },
            {
                "account_id": revenue.id,
                "branch_id": branch.id,
                "debit": Decimal("0"),
                "credit": Decimal("100"),
            },
        ],
        strict_subledger=True,
    )
    assert je is not None
    await db_session.commit()

    await update_journal_entry(
        db_session,
        journal_entry_id=je.id,
        entry_date=date.today(),
        description="after",
        lines=[
            {
                "account_id": cash.id,
                "branch_id": branch.id,
                "debit": Decimal("200"),
                "credit": Decimal("0"),
            },
            {
                "account_id": revenue.id,
                "branch_id": branch.id,
                "debit": Decimal("0"),
                "credit": Decimal("200"),
            },
        ],
    )
    await db_session.commit()
    await db_session.refresh(je)
    db_session.expire(je, ["lines"])

    detail = await get_journal_entry_detail(db_session, journal_entry_id=je.id)
    assert detail.description == "after"
    assert len(detail.lines) == 2
    assert detail.lines[0].debit == Decimal("200.00") or detail.lines[1].debit == Decimal("200.00")


@pytest.mark.asyncio
async def test_update_rejects_unbalanced(db_session) -> None:
    await seed_accounting_defaults(db_session)
    cash = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1000"))
    ).scalar_one()
    revenue = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "4000"))
    ).scalar_one()

    branch = Branch(
        name="JE Bad",
        code=f"JEB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    je = await post_journal_entry(
        db_session,
        entry_date=date.today(),
        description="x",
        source_type="manual",
        source_id=f"bad-{uuid.uuid4().hex[:8]}",
        idempotency_key=f"bad-key-{uuid.uuid4().hex}",
        lines=[
            {
                "account_id": cash.id,
                "branch_id": branch.id,
                "debit": Decimal("50"),
                "credit": Decimal("0"),
            },
            {
                "account_id": revenue.id,
                "branch_id": branch.id,
                "debit": Decimal("0"),
                "credit": Decimal("50"),
            },
        ],
        strict_subledger=True,
    )
    assert je is not None

    with pytest.raises(ValidationError):
        await update_journal_entry(
            db_session,
            journal_entry_id=je.id,
            entry_date=date.today(),
            description="unbalanced",
            lines=[
                {
                    "account_id": cash.id,
                    "branch_id": branch.id,
                    "debit": Decimal("50"),
                    "credit": Decimal("0"),
                },
                {
                    "account_id": revenue.id,
                    "branch_id": branch.id,
                    "debit": Decimal("0"),
                    "credit": Decimal("40"),
                },
            ],
        )
