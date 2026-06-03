"""Core GL posting: balanced journal batches (Epic 5.1–5.2)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError, ValidationError
from app.models.accounting_settings import AccountingSettings
from app.models.currency import Currency
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.services.accounting_governance_service import ensure_period_open
from app.services.chart_account_service import validate_accounts_for_journal_posting

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
    strict_subledger: bool = False,
) -> JournalEntry | None:
    """Insert a balanced journal batch. Returns existing entry if idempotency_key matches.

    Each line dict: account_id, branch_id, debit, credit; optional memo, currency_code,
    transaction_amount, fx_rate, customer_id, supplier_id, employee_id.
    """
    existing = await db.execute(
        select(JournalEntry).where(JournalEntry.idempotency_key == idempotency_key)
    )
    if existing.scalar_one_or_none():
        return None

    if not lines:
        raise ValidationError("Journal entry must contain at least one line")

    validation_lines = [
        {
            "account_id": int(ln["account_id"]),
            "customer_id": ln.get("customer_id"),
            "supplier_id": ln.get("supplier_id"),
            "employee_id": ln.get("employee_id"),
        }
        for ln in lines
    ]
    if strict_subledger:
        await validate_accounts_for_journal_posting(db, lines=validation_lines)
    else:
        await validate_accounts_for_journal_posting(
            db, account_ids=[int(ln["account_id"]) for ln in lines]
        )

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
                "customer_id": ln.get("customer_id"),
                "supplier_id": ln.get("supplier_id"),
                "employee_id": ln.get("employee_id"),
            }
        )

    settings = await get_accounting_settings(db)
    base_res = await db.execute(
        select(Currency.code).where(Currency.id == settings.base_currency_id)
    )
    base_code = str(base_res.scalar_one()).strip()
    for i, ln in enumerate(normalized):
        cc = ln.get("currency_code")
        txn_amt = ln.get("transaction_amount")
        fx = ln.get("fx_rate")
        is_foreign = isinstance(cc, str) and cc.strip() and cc.strip().upper() != base_code.upper()
        if is_foreign:
            if txn_amt is None or fx is None:
                raise ValidationError(
                    "Foreign-currency journal lines require transaction_amount and fx_rate",
                    details={"line": i, "currency_code": cc},
                )
            if fx <= 0:
                raise ValidationError(
                    "fx_rate must be positive for foreign-currency lines",
                    details={"line": i},
                )
        else:
            if (txn_amt is not None) ^ (fx is not None):
                raise ValidationError(
                    "transaction_amount and fx_rate must both be set or both omitted",
                    details={"line": i},
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
        if ln.get("customer_id") is not None:
            line_kw["customer_id"] = int(ln["customer_id"])
        if ln.get("supplier_id") is not None:
            line_kw["supplier_id"] = int(ln["supplier_id"])
        if ln.get("employee_id") is not None:
            line_kw["employee_id"] = int(ln["employee_id"])
        db.add(JournalEntryLine(**line_kw))
    await db.flush()
    return je


async def _build_normalized_journal_lines(
    db: AsyncSession,
    *,
    lines: list[dict],
    strict_subledger: bool,
) -> list[dict]:
    """Validate and normalize journal lines for post/update."""
    if not lines:
        raise ValidationError("Journal entry must contain at least one line")

    validation_lines = [
        {
            "account_id": int(ln["account_id"]),
            "customer_id": ln.get("customer_id"),
            "supplier_id": ln.get("supplier_id"),
            "employee_id": ln.get("employee_id"),
        }
        for ln in lines
    ]
    if strict_subledger:
        await validate_accounts_for_journal_posting(db, lines=validation_lines)
    else:
        await validate_accounts_for_journal_posting(
            db, account_ids=[int(ln["account_id"]) for ln in lines]
        )

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
                "customer_id": ln.get("customer_id"),
                "supplier_id": ln.get("supplier_id"),
                "employee_id": ln.get("employee_id"),
            }
        )

    settings = await get_accounting_settings(db)
    base_res = await db.execute(
        select(Currency.code).where(Currency.id == settings.base_currency_id)
    )
    base_code = str(base_res.scalar_one()).strip()
    for i, ln in enumerate(normalized):
        cc = ln.get("currency_code")
        txn_amt = ln.get("transaction_amount")
        fx = ln.get("fx_rate")
        is_foreign = isinstance(cc, str) and cc.strip() and cc.strip().upper() != base_code.upper()
        if is_foreign:
            if txn_amt is None or fx is None:
                raise ValidationError(
                    "Foreign-currency journal lines require transaction_amount and fx_rate",
                    details={"line": i, "currency_code": cc},
                )
            if fx <= 0:
                raise ValidationError(
                    "fx_rate must be positive for foreign-currency lines",
                    details={"line": i},
                )
        else:
            if (txn_amt is not None) ^ (fx is not None):
                raise ValidationError(
                    "transaction_amount and fx_rate must both be set or both omitted",
                    details={"line": i},
                )

    if _q2(total_dr) != _q2(total_cr):
        raise ValidationError(
            "Journal entry is not balanced",
            details={"total_debit": str(total_dr), "total_credit": str(total_cr)},
        )
    return normalized


async def update_journal_entry(
    db: AsyncSession,
    *,
    journal_entry_id: int,
    entry_date: date,
    description: str,
    lines: list[dict],
) -> JournalEntry:
    """Replace lines and header on an existing posted journal entry."""
    res = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.id == journal_entry_id)
    )
    je = res.scalar_one_or_none()
    if je is None:
        raise NotFoundError(
            "Journal entry not found", details={"journal_entry_id": journal_entry_id}
        )

    if je.source_type == "journal_reversal":
        raise ValidationError("Cannot edit a journal reversal entry")

    rev_res = await db.execute(
        select(JournalEntry.id).where(JournalEntry.reverses_entry_id == journal_entry_id)
    )
    if rev_res.scalar_one_or_none() is not None:
        raise ValidationError("Cannot edit a reversed journal entry")

    await ensure_period_open(db, entry_date=je.entry_date)
    period = await ensure_period_open(db, entry_date=entry_date)

    normalized = await _build_normalized_journal_lines(db, lines=lines, strict_subledger=True)

    for ln in list(je.lines):
        await db.delete(ln)
    await db.flush()

    je.entry_date = entry_date
    je.description = description[:512]
    je.period_id = period.id

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
        if ln.get("customer_id") is not None:
            line_kw["customer_id"] = int(ln["customer_id"])
        if ln.get("supplier_id") is not None:
            line_kw["supplier_id"] = int(ln["supplier_id"])
        if ln.get("employee_id") is not None:
            line_kw["employee_id"] = int(ln["employee_id"])
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
