"""Fiscal period locks and journal reversal workflows."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError, ValidationError
from app.models.fiscal_period import FiscalPeriod
from app.models.journal_entries import JournalEntry, JournalEntryLine


def fiscal_period_key(entry_date: date) -> str:
    """Stable YYYY-MM key for the calendar month containing entry_date."""
    period_key, _, _ = _month_bounds(entry_date)
    return period_key


def same_fiscal_period_as_today(entry_date: date, *, today: date | None = None) -> bool:
    """True if entry_date falls in the same calendar month as `today` (default: UTC date today)."""
    anchor = today or date.today()
    return fiscal_period_key(entry_date) == fiscal_period_key(anchor)


def _month_bounds(entry_date: date) -> tuple[str, date, date]:
    period_start = entry_date.replace(day=1)
    if period_start.month == 12:
        next_month = period_start.replace(year=period_start.year + 1, month=1, day=1)
    else:
        next_month = period_start.replace(month=period_start.month + 1, day=1)
    period_end = next_month - timedelta(days=1)
    period_key = f"{period_start.year:04d}-{period_start.month:02d}"
    return period_key, period_start, period_end


async def get_or_create_period(db: AsyncSession, *, entry_date: date) -> FiscalPeriod:
    period_key, period_start, period_end = _month_bounds(entry_date)
    result = await db.execute(select(FiscalPeriod).where(FiscalPeriod.period_key == period_key))
    period = result.scalar_one_or_none()
    if period:
        return period
    period = FiscalPeriod(
        period_key=period_key,
        period_start=period_start,
        period_end=period_end,
        status="open",
    )
    db.add(period)
    await db.flush()
    await db.refresh(period)
    return period


async def ensure_period_open(
    db: AsyncSession, *, entry_date: date, allow_in_soft_close: bool = False
) -> FiscalPeriod:
    """Ensure period allows GL posting.

    - ``closed``: never postable.
    - ``soft_closed``: only reversal workflows should pass ``allow_in_soft_close=True``.
    - ``open``: always postable.

    Raises:
        ValidationError: If the period is closed or soft-closed without override.
    """
    period = await get_or_create_period(db, entry_date=entry_date)
    if period.status == "closed":
        raise ValidationError(
            "Cannot post journal entry to a closed fiscal period",
            details={"period_key": period.period_key},
        )
    if period.status == "soft_closed" and not allow_in_soft_close:
        raise ValidationError(
            "Cannot post to a soft-closed fiscal period (only journal reversals may post)",
            details={"period_key": period.period_key, "status": "soft_closed"},
        )
    return period


async def ensure_period_not_hard_closed(db: AsyncSession, *, entry_date: date) -> FiscalPeriod:
    """Ensure period is not hard-closed. Allows open and soft_closed.

    Used for operations that should be blocked only after hard-close.
    """
    period = await get_or_create_period(db, entry_date=entry_date)
    if period.status == "closed":
        raise ValidationError(
            "Period is permanently closed",
            details={"period_key": period.period_key, "status": "closed"},
        )
    return period


async def can_post_to_period(db: AsyncSession, *, entry_date: date) -> tuple[bool, str]:
    """Check if posting is allowed and provide reason.

    Returns (allowed: bool, reason: str).
    """
    period = await get_or_create_period(db, entry_date=entry_date)
    if period.status == "open":
        return True, "Period is open"
    if period.status == "soft_closed":
        return False, "Period is soft-closed (only reversing journal entries may post)"
    return False, f"Period {period.period_key} is permanently closed"


async def list_periods(db: AsyncSession) -> list[FiscalPeriod]:
    result = await db.execute(select(FiscalPeriod).order_by(FiscalPeriod.period_start.desc()))
    return list(result.scalars().all())


async def set_period_status(
    db: AsyncSession,
    *,
    period_key: str,
    status: str,
    actor_user_id: int,
) -> FiscalPeriod:
    result = await db.execute(select(FiscalPeriod).where(FiscalPeriod.period_key == period_key))
    period = result.scalar_one_or_none()
    if not period:
        raise NotFoundError("Fiscal period not found", details={"period_key": period_key})
    valid = {"open", "soft_closed", "closed"}
    if status not in valid:
        raise ValidationError("Invalid period status", details={"status": status})

    old = period.status
    if old == status:
        await db.flush()
        await db.refresh(period)
        return period

    transitions: dict[str, set[str]] = {
        "open": {"soft_closed", "closed"},
        "soft_closed": {"open", "closed"},
        "closed": {"open", "soft_closed"},
    }
    if status not in transitions.get(old, set()):
        raise ValidationError(
            "Invalid fiscal period transition",
            details={"from": old, "to": status, "period_key": period_key},
        )

    period.status = status
    if status == "closed":
        period.closed_at = datetime.now(UTC)
        period.closed_by_user_id = actor_user_id
    else:
        period.closed_at = None
        period.closed_by_user_id = None
    await db.flush()
    await db.refresh(period)
    return period


async def get_fiscal_period_detail(
    db: AsyncSession,
    *,
    period_key: str,
    branch_id: int | None = None,
) -> dict:
    """Full fiscal period snapshot: metadata, TB, sub-ledgers, open items."""
    from app.services.financial_reports_service import (
        subledger_activity_for_period,
        trial_balance_for_period,
    )
    from app.services.subledger_service import list_ap_open_items, list_ar_open_items
    from app.models.users import User
    from app.utils.person_name import display_person_name

    result = await db.execute(select(FiscalPeriod).where(FiscalPeriod.period_key == period_key))
    period = result.scalar_one_or_none()
    if not period:
        raise NotFoundError("Fiscal period not found", details={"period_key": period_key})

    closed_by_name: str | None = None
    if period.closed_by_user_id is not None:
        user_res = await db.execute(select(User).where(User.id == period.closed_by_user_id))
        user = user_res.scalar_one_or_none()
        if user is not None:
            closed_by_name = display_person_name(
                user.first_name, user.father_name, user.family_name
            ) or user.email

    can_post, posting_reason = await can_post_to_period(db, entry_date=period.period_end)

    tb_rows = await trial_balance_for_period(
        db,
        period_start=period.period_start,
        period_end=period.period_end,
        branch_id=branch_id,
    )
    subledger_rows = await subledger_activity_for_period(
        db,
        period_start=period.period_start,
        period_end=period.period_end,
        branch_id=branch_id,
    )

    ar_open = await list_ar_open_items(db, branch_id=branch_id, status="open")
    ap_open = await list_ap_open_items(db, branch_id=branch_id, status="open")
    ar_open = [i for i in ar_open if i.document_date <= period.period_end]
    ap_open = [i for i in ap_open if i.document_date <= period.period_end]

    return {
        "period": period,
        "closed_by_name": closed_by_name,
        "can_post": can_post,
        "posting_reason": posting_reason,
        "trial_balance": tb_rows,
        "subledger_activity": subledger_rows,
        "ar_open_items_count": len(ar_open),
        "ar_open_amount": sum((i.amount_open for i in ar_open), start=Decimal("0")),
        "ap_open_items_count": len(ap_open),
        "ap_open_amount": sum((i.amount_open for i in ap_open), start=Decimal("0")),
    }


async def list_journal_entries_for_source(
    db: AsyncSession, *, source_type: str, source_id: str
) -> list[JournalEntry]:
    """Posted batches for a document, oldest first (for deterministic reversal order)."""
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.source_type == source_type,
            JournalEntry.source_id == source_id,
        )
        .order_by(JournalEntry.id.asc())
    )
    return list(result.scalars().all())


async def reverse_journal_entry(
    db: AsyncSession,
    *,
    journal_entry_id: int,
    actor_user_id: int,
    reason: str | None,
    reversal_date: date | None = None,
) -> JournalEntry:
    original_result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.id == journal_entry_id)
    )
    original = original_result.scalar_one_or_none()
    if not original:
        raise NotFoundError(
            "Journal entry not found", details={"journal_entry_id": journal_entry_id}
        )

    existing = await db.execute(
        select(JournalEntry).where(JournalEntry.reverses_entry_id == journal_entry_id)
    )
    if existing.scalar_one_or_none():
        raise ValidationError(
            "Journal entry already reversed", details={"journal_entry_id": journal_entry_id}
        )

    posting_date = reversal_date or date.today()
    period = await ensure_period_open(db, entry_date=posting_date, allow_in_soft_close=True)

    description = f"Reversal of JE #{original.id}"
    if reason:
        description = f"{description} ({reason})"

    reversal = JournalEntry(
        entry_date=posting_date,
        description=description[:512],
        source_type="journal_reversal",
        source_id=str(original.id),
        idempotency_key=f"journal_reversal:{original.id}",
        period_id=period.id,
        reverses_entry_id=original.id,
        posted_at=datetime.now(UTC),
    )
    db.add(reversal)
    await db.flush()

    for line in original.lines:
        line_kw: dict = {
            "journal_entry_id": reversal.id,
            "line_no": line.line_no,
            "account_id": line.account_id,
            "branch_id": line.branch_id,
            "debit": line.credit,
            "credit": line.debit,
            "memo": f"Reversal of line {line.line_no}",
        }
        if getattr(line, "currency_code", None):
            line_kw["currency_code"] = line.currency_code[:3]
        if getattr(line, "transaction_amount", None) is not None:
            line_kw["transaction_amount"] = line.transaction_amount
        if getattr(line, "fx_rate", None) is not None:
            line_kw["fx_rate"] = line.fx_rate
        db.add(JournalEntryLine(**line_kw))

    await db.flush()
    await db.refresh(reversal)
    return reversal
