"""GL posting for loyalty point movements (Milestone 5)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.loyalty import LedgerEntryType, LedgerReasonCode, LoyaltyLedger
from app.services.accounting_service import get_accounting_settings, post_journal_entry
from app.utils.money import q2


async def _default_loyalty_branch_id(db: AsyncSession) -> int | None:
    res = await db.execute(
        select(Branch.id)
        .where(Branch.is_active.is_(True), Branch.archived_at.is_(None))
        .order_by(Branch.id.asc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def post_loyalty_ledger_gl(db: AsyncSession, entry: LoyaltyLedger) -> None:
    """Post liability / expense (accrual) or liability / revenue (redemption, expiry).

    Uses ``default_loyalty_point_value`` from accounting settings as functional currency
    per point. Idempotent on ``loyalty_ledger:{entry.id}``.
    """
    settings = await get_accounting_settings(db)
    branch_id = await _default_loyalty_branch_id(db)
    if branch_id is None:
        return

    per_point = q2(Decimal(str(settings.default_loyalty_point_value)))
    if per_point <= 0:
        return

    amount = q2(per_point * Decimal(entry.points))
    if amount <= 0:
        return

    entry_date = entry.created_at.date() if entry.created_at else date.today()
    liab = settings.default_loyalty_liability_account_id
    exp = settings.default_loyalty_expense_account_id
    rev = settings.default_sales_revenue_account_id

    if entry.entry_type == LedgerEntryType.CREDIT:
        lines = [
            {
                "account_id": exp,
                "branch_id": branch_id,
                "debit": amount,
                "credit": Decimal("0"),
                "memo": f"Loyalty accrual ({entry.reason_code.value})",
            },
            {
                "account_id": liab,
                "branch_id": branch_id,
                "debit": Decimal("0"),
                "credit": amount,
                "memo": "Loyalty points liability",
            },
        ]
    else:
        if entry.reason_code in (LedgerReasonCode.REDEMPTION, LedgerReasonCode.EXPIRY):
            lines = [
                {
                    "account_id": liab,
                    "branch_id": branch_id,
                    "debit": amount,
                    "credit": Decimal("0"),
                    "memo": f"Loyalty {entry.reason_code.value}",
                },
                {
                    "account_id": rev,
                    "branch_id": branch_id,
                    "debit": Decimal("0"),
                    "credit": amount,
                    "memo": "Loyalty redemption / breakage revenue",
                },
            ]
        else:
            lines = [
                {
                    "account_id": liab,
                    "branch_id": branch_id,
                    "debit": amount,
                    "credit": Decimal("0"),
                    "memo": f"Loyalty debit ({entry.reason_code.value})",
                },
                {
                    "account_id": exp,
                    "branch_id": branch_id,
                    "debit": Decimal("0"),
                    "credit": amount,
                    "memo": "Loyalty program expense reversal",
                },
            ]

    await post_journal_entry(
        db,
        entry_date=entry_date,
        description=f"Loyalty ledger {entry.id}",
        source_type="loyalty_ledger",
        source_id=str(entry.id),
        idempotency_key=f"loyalty_ledger:{entry.id}",
        lines=lines,
    )
