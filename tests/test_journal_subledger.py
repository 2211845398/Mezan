"""Journal sub-ledger and is_leaf posting rules."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.chart_accounts import ChartAccount
from app.models.customer_profile import CustomerProfile
from app.services.accounting_service import post_journal_entry
from app.services.financial_reports_service import get_ledger_report
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_post_rejects_control_account(db_session) -> None:
    await seed_accounting_defaults(db_session)
    ar_control = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1100"))
    ).scalar_one()

    branch = Branch(
        name="Subledger Branch",
        code=f"SL-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    with pytest.raises(ValidationError):
        await post_journal_entry(
            db_session,
            entry_date=date.today(),
            description="bad",
            source_type="manual",
            source_id="x1",
            idempotency_key=f"test-bad-{uuid.uuid4().hex}",
            lines=[
                {
                    "account_id": ar_control.id,
                    "branch_id": branch.id,
                    "debit": Decimal("10"),
                    "credit": Decimal("0"),
                },
                {
                    "account_id": (
                        await db_session.execute(
                            select(ChartAccount).where(ChartAccount.code == "1000")
                        )
                    )
                    .scalar_one()
                    .id,
                    "branch_id": branch.id,
                    "debit": Decimal("0"),
                    "credit": Decimal("10"),
                },
            ],
        )


@pytest.mark.asyncio
async def test_manual_post_requires_customer_on_ar_leaf(db_session) -> None:
    await seed_accounting_defaults(db_session)
    ar_leaf = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1110"))
    ).scalar_one()

    branch = Branch(
        name="SL2",
        code=f"SL2-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cash = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1000"))
    ).scalar_one()

    with pytest.raises(ValidationError):
        await post_journal_entry(
            db_session,
            entry_date=date.today(),
            description="missing customer",
            source_type="manual",
            source_id="x2",
            idempotency_key=f"test-miss-cust-{uuid.uuid4().hex}",
            lines=[
                {
                    "account_id": ar_leaf.id,
                    "branch_id": branch.id,
                    "debit": Decimal("50"),
                    "credit": Decimal("0"),
                },
                {
                    "account_id": cash.id,
                    "branch_id": branch.id,
                    "debit": Decimal("0"),
                    "credit": Decimal("50"),
                },
            ],
            strict_subledger=True,
        )


@pytest.mark.asyncio
async def test_manual_post_with_customer_and_gl_filter(db_session) -> None:
    await seed_accounting_defaults(db_session)
    ar_leaf = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1110"))
    ).scalar_one()
    cash = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1000"))
    ).scalar_one()

    branch = Branch(
        name="SL3",
        code=f"SL3-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    customer = CustomerProfile(phone=f"+9665{uuid.uuid4().int % 10_000_000:07d}")
    db_session.add(customer)
    await db_session.flush()

    ikey = f"test-ok-{uuid.uuid4().hex}"
    await post_journal_entry(
        db_session,
        entry_date=date.today(),
        description="AR with customer",
        source_type="manual",
        source_id="x3",
        idempotency_key=ikey,
        lines=[
            {
                "account_id": ar_leaf.id,
                "branch_id": branch.id,
                "debit": Decimal("25"),
                "credit": Decimal("0"),
                "customer_id": customer.id,
            },
            {
                "account_id": cash.id,
                "branch_id": branch.id,
                "debit": Decimal("0"),
                "credit": Decimal("25"),
            },
        ],
        strict_subledger=True,
    )
    await db_session.commit()

    rows = await get_ledger_report(
        db_session,
        account_id=ar_leaf.id,
        date_from=date.today(),
        date_to=date.today(),
        customer_id=customer.id,
    )
    assert len(rows) == 1
    assert rows[0]["customer_id"] == customer.id
    assert rows[0]["debit"] == Decimal("25.00")

    other = await get_ledger_report(
        db_session,
        account_id=ar_leaf.id,
        date_from=date.today(),
        date_to=date.today(),
        customer_id=customer.id + 9999,
    )
    assert other == []
