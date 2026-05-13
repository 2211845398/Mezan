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
from app.services.accounting_governance_service import ensure_period_open

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
    allow_posting_in_soft_closed: bool = False,
) -> JournalEntry | None:
    """Insert a balanced journal batch. Returns existing entry if idempotency_key matches.

    Each line dict: account_id, branch_id, debit, credit; optional memo, currency_code,
    transaction_amount, fx_rate (persisted on journal_entry_lines when provided).
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
        cc = ln.get("currency_code")
        txn_amt = ln.get("transaction_amount")
        fx = ln.get("fx_rate")
        if txn_amt is not None:
            txn_amt = _q2(Decimal(str(txn_amt)))
        if fx is not None:
            fx = Decimal(str(fx))
        normalized.append(
            {
                "line_no": i + 1,
                "account_id": int(ln["account_id"]),
                "branch_id": int(ln["branch_id"]),
                "debit": dr,
                "credit": cr,
                "memo": ln.get("memo"),
                "currency_code": cc if isinstance(cc, str) and cc.strip() else None,
                "transaction_amount": txn_amt,
                "fx_rate": fx,
            }
        )

    if _q2(total_dr) != _q2(total_cr):
        raise ValidationError(
            "Journal entry is not balanced",
            details={"total_debit": str(total_dr), "total_credit": str(total_cr)},
        )

    period = await ensure_period_open(
        db, entry_date=entry_date, allow_in_soft_close=allow_posting_in_soft_closed
    )

    je = JournalEntry(
        entry_date=entry_date,
        description=description[:512],
        source_type=source_type,
        source_id=source_id,
        idempotency_key=idempotency_key,
        period_id=period.id,
        posted_at=datetime.now(UTC),
    )
    db.add(je)
    await db.flush()

    for ln in normalized:
        line_kw: dict = {
            "journal_entry_id": je.id,
            "line_no": ln["line_no"],
            "account_id": ln["account_id"],
            "branch_id": ln["branch_id"],
            "debit": ln["debit"],
            "credit": ln["credit"],
            "memo": ln["memo"],
        }
        if ln.get("currency_code"):
            line_kw["currency_code"] = ln["currency_code"][:3]
        if ln.get("transaction_amount") is not None:
            line_kw["transaction_amount"] = ln["transaction_amount"]
        if ln.get("fx_rate") is not None:
            line_kw["fx_rate"] = ln["fx_rate"]
        db.add(JournalEntryLine(**line_kw))
    await db.flush()
    return je


async def get_journal_by_idempotency(db: AsyncSession, idempotency_key: str) -> JournalEntry | None:
    res = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.idempotency_key == idempotency_key)
    )
    return res.scalar_one_or_none()
