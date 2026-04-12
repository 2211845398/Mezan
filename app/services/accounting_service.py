"""Core GL posting: balanced journal batches (Epic 5.1–5.2)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ValidationError
from app.models.accounting_settings import AccountingSettings
from app.models.journal_entries import JournalEntry, JournalEntryLine


MONEY = Decimal("0.01")


def _q2(value: Decimal) -> Decimal:
    return value.quantize(MONEY)


async def get_accounting_settings(db: AsyncSession) -> AccountingSettings:
    res = await db.execute(select(AccountingSettings).where(AccountingSettings.id == 1))
    row = res.scalar_one_or_none()
    if not row:
        raise ValidationError("Accounting is not configured (missing accounting_settings row)")
    return row


async def post_journal_entry(
    db: AsyncSession,
    *,
    entry_date: date,
    description: str,
    source_type: str,
    source_id: str,
    idempotency_key: str,
    lines: list[dict],
) -> JournalEntry | None:
    """Insert a balanced journal batch. Returns existing entry if idempotency_key matches.

    Each line dict: account_id, branch_id, debit: Decimal, credit: Decimal, memo optional.
    """
    existing = await db.execute(
        select(JournalEntry).where(JournalEntry.idempotency_key == idempotency_key)
    )
    if existing.scalar_one_or_none():
        return None

    total_dr = Decimal("0")
    total_cr = Decimal("0")
    normalized: list[dict] = []
    for i, ln in enumerate(lines):
        dr = _q2(Decimal(str(ln.get("debit", 0))))
        cr = _q2(Decimal(str(ln.get("credit", 0))))
        if dr < 0 or cr < 0:
            raise ValidationError("Line amounts must be non-negative", details={"line": i})
        if (dr > 0 and cr > 0) or (dr == 0 and cr == 0):
            raise ValidationError(
                "Each line must have exactly one of debit or credit positive",
                details={"line": i},
            )
        total_dr += dr
        total_cr += cr
        normalized.append(
            {
                "line_no": i + 1,
                "account_id": int(ln["account_id"]),
                "branch_id": int(ln["branch_id"]),
                "debit": dr,
                "credit": cr,
                "memo": ln.get("memo"),
            }
        )

    if _q2(total_dr) != _q2(total_cr):
        raise ValidationError(
            "Journal entry is not balanced",
            details={"total_debit": str(total_dr), "total_credit": str(total_cr)},
        )

    je = JournalEntry(
        entry_date=entry_date,
        description=description[:512],
        source_type=source_type,
        source_id=source_id,
        idempotency_key=idempotency_key,
        posted_at=datetime.now(UTC),
    )
    db.add(je)
    await db.flush()

    for ln in normalized:
        db.add(
            JournalEntryLine(
                journal_entry_id=je.id,
                line_no=ln["line_no"],
                account_id=ln["account_id"],
                branch_id=ln["branch_id"],
                debit=ln["debit"],
                credit=ln["credit"],
                memo=ln["memo"],
            )
        )
    await db.flush()
    return je


async def get_journal_by_idempotency(
    db: AsyncSession, idempotency_key: str
) -> JournalEntry | None:
    res = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.idempotency_key == idempotency_key)
    )
    return res.scalar_one_or_none()
