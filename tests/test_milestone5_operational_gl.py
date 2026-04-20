"""Milestone 5: shift cash variance GL + loyalty liability / revenue GL."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.branch import Branch
from app.models.customer_profile import CustomerProfile
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.loyalty import LedgerEntryType, LedgerReasonCode
from app.models.pos_terminal import POSTerminal
from app.models.users import User
from app.services.loyalty_service import adjust_points
from app.services.seed_service import seed_accounting_defaults
from app.services.shift_service import close_shift, open_shift


@pytest.mark.asyncio
async def test_close_shift_posts_variance_journal(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="Shift GL Branch",
        code=f"S5-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    user = User(
        email=f"s5-{uuid.uuid4().hex[:8]}@example.com",
        full_name="Shift",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([branch, user])
    await db_session.flush()

    terminal = POSTerminal(
        branch_id=branch.id,
        name="S5 T",
        terminal_code=f"S5T-{uuid.uuid4().hex[:8]}",
        api_key_hash="h",
        is_authorized=True,
    )
    db_session.add(terminal)
    await db_session.flush()

    shift = await open_shift(
        db_session,
        terminal_id=terminal.id,
        opening_float=Decimal("100.00"),
        opened_by_user_id=user.id,
    )
    await close_shift(
        db_session,
        shift_id=shift.id,
        declared_cash=Decimal("107.50"),
        closed_by_user_id=user.id,
    )
    await db_session.commit()

    je_res = await db_session.execute(
        select(JournalEntry).where(JournalEntry.idempotency_key == f"pos_shift:{shift.id}:variance")
    )
    je = je_res.scalar_one_or_none()
    assert je is not None
    assert je.source_type == "pos_shift"
    lines_res = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.journal_entry_id == je.id)
    )
    lines = list(lines_res.scalars().all())
    assert len(lines) == 2
    assert sum(ln.debit for ln in lines) == sum(ln.credit for ln in lines)


@pytest.mark.asyncio
async def test_loyalty_manual_credit_posts_expense_and_liability(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="Loyalty GL Branch",
        code=f"L5-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    cust = CustomerProfile(
        phone=f"+1555{uuid.uuid4().int % 10_000_000:07d}",
        full_name="Loyalty GL",
        is_temporary=False,
    )
    user = User(
        email=f"l5-{uuid.uuid4().hex[:8]}@example.com",
        full_name="Aud",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([cust, user])
    await db_session.flush()

    entry = await adjust_points(
        db_session,
        customer_id=cust.id,
        points=100,
        entry_type=LedgerEntryType.CREDIT,
        reason_code=LedgerReasonCode.MANUAL_ADJUSTMENT,
        auditor_id=user.id,
    )
    await db_session.commit()

    je_res = await db_session.execute(
        select(JournalEntry).where(JournalEntry.idempotency_key == f"loyalty_ledger:{entry.id}")
    )
    je = je_res.scalar_one_or_none()
    assert je is not None
    lines_res = await db_session.execute(
        select(JournalEntryLine).where(JournalEntryLine.journal_entry_id == je.id)
    )
    lines = list(lines_res.scalars().all())
    assert len(lines) == 2
    assert sum(ln.debit for ln in lines) == Decimal("1.00")
    assert sum(ln.credit for ln in lines) == Decimal("1.00")


@pytest.mark.asyncio
async def test_loyalty_redemption_debit_posts_liability_and_revenue(db_session) -> None:
    await seed_accounting_defaults(db_session)
    branch = Branch(
        name="Loyalty Redeem Branch",
        code=f"LR-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    cust = CustomerProfile(
        phone=f"+1666{uuid.uuid4().int % 10_000_000:07d}",
        full_name="Redeem",
        is_temporary=False,
    )
    user = User(
        email=f"r5-{uuid.uuid4().hex[:8]}@example.com",
        full_name="Aud",
        password_hash="x",
        status="active",
        branch_id=None,
    )
    db_session.add_all([cust, user])
    await db_session.flush()

    await adjust_points(
        db_session,
        customer_id=cust.id,
        points=50,
        entry_type=LedgerEntryType.CREDIT,
        reason_code=LedgerReasonCode.MANUAL_ADJUSTMENT,
        auditor_id=user.id,
    )
    redeem = await adjust_points(
        db_session,
        customer_id=cust.id,
        points=20,
        entry_type=LedgerEntryType.DEBIT,
        reason_code=LedgerReasonCode.REDEMPTION,
        auditor_id=user.id,
    )
    await db_session.commit()

    je_res = await db_session.execute(
        select(JournalEntry).where(JournalEntry.idempotency_key == f"loyalty_ledger:{redeem.id}")
    )
    je = je_res.scalar_one_or_none()
    assert je is not None
