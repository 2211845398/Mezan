"""Financial statement and GL inquiry services (Epic 5.5).

These statement queries are intentionally keyed on ``JournalEntry.entry_date``.
They should not be refactored to filter on timestamp metadata such as
``posted_at``, because reporting periods in accounting are calendar dates.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chart_accounts import AccountType, ChartAccount
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.utils.money import q2


async def trial_balance(
    db: AsyncSession,
    *,
    as_of: date,
    branch_id: int | None = None,
) -> list[dict]:
    """Per-account debit/credit totals through as_of on entry_date (inclusive)."""
    stmt = (
        select(
            JournalEntryLine.account_id,
            ChartAccount.code,
            ChartAccount.name,
            ChartAccount.account_type,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("total_credit"),
        )
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(ChartAccount, ChartAccount.id == JournalEntryLine.account_id)
        .where(JournalEntry.entry_date <= as_of)
    )
    if branch_id is not None:
        stmt = stmt.where(JournalEntryLine.branch_id == branch_id)
    stmt = stmt.group_by(
        JournalEntryLine.account_id,
        ChartAccount.code,
        ChartAccount.name,
        ChartAccount.account_type,
    ).order_by(ChartAccount.code)
    res = await db.execute(stmt)
    rows = []
    for r in res.all():
        dr = q2(r.total_debit)
        cr = q2(r.total_credit)
        at = r.account_type
        at_s = at.value if isinstance(at, AccountType) else str(at)
        rows.append(
            {
                "account_id": r.account_id,
                "code": r.code,
                "name": r.name,
                "account_type": at_s,
                "total_debit": dr,
                "total_credit": cr,
                "net": q2(dr - cr),
            }
        )
    return rows


async def general_ledger_lines(
    db: AsyncSession,
    *,
    account_id: int,
    date_from: date,
    date_to: date,
    branch_id: int | None = None,
) -> list[dict]:
    """Posted lines for one account in an entry_date range."""
    stmt = (
        select(
            JournalEntry.id,
            JournalEntry.entry_date,
            JournalEntry.description,
            JournalEntry.source_type,
            JournalEntry.source_id,
            JournalEntryLine.line_no,
            JournalEntryLine.debit,
            JournalEntryLine.credit,
            JournalEntryLine.branch_id,
            JournalEntryLine.memo,
        )
        .join(JournalEntryLine, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntryLine.account_id == account_id,
            JournalEntry.entry_date >= date_from,
            JournalEntry.entry_date <= date_to,
        )
        .order_by(JournalEntry.entry_date, JournalEntry.id, JournalEntryLine.line_no)
    )
    if branch_id is not None:
        stmt = stmt.where(JournalEntryLine.branch_id == branch_id)
    res = await db.execute(stmt)
    return [
        {
            "journal_entry_id": r.id,
            "entry_date": r.entry_date.isoformat(),
            "description": r.description,
            "source_type": r.source_type,
            "source_id": r.source_id,
            "line_no": r.line_no,
            "debit": q2(r.debit),
            "credit": q2(r.credit),
            "branch_id": r.branch_id,
            "memo": r.memo,
        }
        for r in res.all()
    ]


async def income_statement(
    db: AsyncSession,
    *,
    period_start: date,
    period_end: date,
    branch_id: int | None = None,
) -> dict:
    """Revenue and expense totals for the period by journal entry_date (P&L)."""
    stmt = (
        select(
            ChartAccount.account_type,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("dr"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("cr"),
        )
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(ChartAccount, ChartAccount.id == JournalEntryLine.account_id)
        .where(
            JournalEntry.entry_date >= period_start,
            JournalEntry.entry_date <= period_end,
            # Enum IN () uses a bind processor that may not match VARCHAR stored values; compare as text.
            cast(ChartAccount.account_type, String).in_(
                [AccountType.REVENUE.value, AccountType.EXPENSE.value]
            ),
        )
    )
    if branch_id is not None:
        stmt = stmt.where(JournalEntryLine.branch_id == branch_id)
    stmt = stmt.group_by(ChartAccount.account_type)

    res = await db.execute(stmt)
    rows = res.all()
    revenue_total = Decimal("0")
    expense_total = Decimal("0")
    for row in rows:
        dr = q2(row.dr)
        cr = q2(row.cr)
        at = row.account_type
        if at == AccountType.REVENUE:
            revenue_total += cr - dr
        elif at == AccountType.EXPENSE:
            expense_total += dr - cr
    net = revenue_total - expense_total

    acct_stmt = (
        select(
            ChartAccount.id,
            ChartAccount.code,
            ChartAccount.name,
            ChartAccount.account_type,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("dr"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("cr"),
        )
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(ChartAccount, ChartAccount.id == JournalEntryLine.account_id)
        .where(
            JournalEntry.entry_date >= period_start,
            JournalEntry.entry_date <= period_end,
            cast(ChartAccount.account_type, String).in_(
                [AccountType.REVENUE.value, AccountType.EXPENSE.value]
            ),
        )
    )
    if branch_id is not None:
        acct_stmt = acct_stmt.where(JournalEntryLine.branch_id == branch_id)
    acct_stmt = acct_stmt.group_by(
        ChartAccount.id,
        ChartAccount.code,
        ChartAccount.name,
        ChartAccount.account_type,
    )
    a_res = await db.execute(acct_stmt)
    revenue_lines: list[dict] = []
    expense_lines: list[dict] = []
    for row in a_res.all():
        dr, cr = q2(row.dr), q2(row.cr)
        at = row.account_type
        at_s = at.value if isinstance(at, AccountType) else str(at)
        if at == AccountType.REVENUE:
            amt = cr - dr
            if amt == 0:
                continue
            revenue_lines.append(
                {
                    "account_id": row.id,
                    "code": row.code,
                    "name": row.name,
                    "account_type": at_s,
                    "amount": q2(amt),
                }
            )
        elif at == AccountType.EXPENSE:
            amt = dr - cr
            if amt == 0:
                continue
            expense_lines.append(
                {
                    "account_id": row.id,
                    "code": row.code,
                    "name": row.name,
                    "account_type": at_s,
                    "amount": q2(amt),
                }
            )
    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_revenue": q2(revenue_total),
        "total_expense": q2(expense_total),
        "net_income": q2(net),
        "revenue_lines": revenue_lines,
        "expense_lines": expense_lines,
    }


async def balance_sheet(
    db: AsyncSession,
    *,
    as_of: date,
    branch_id: int | None = None,
) -> dict:
    """Cumulative balances by statement group through entry_date as_of."""
    stmt = (
        select(
            ChartAccount.account_type,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("dr"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("cr"),
        )
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(ChartAccount, ChartAccount.id == JournalEntryLine.account_id)
        .where(
            JournalEntry.entry_date <= as_of,
            cast(ChartAccount.account_type, String).in_(
                [
                    AccountType.ASSET.value,
                    AccountType.LIABILITY.value,
                    AccountType.EQUITY.value,
                ]
            ),
        )
    )
    if branch_id is not None:
        stmt = stmt.where(JournalEntryLine.branch_id == branch_id)
    stmt = stmt.group_by(ChartAccount.account_type)
    res = await db.execute(stmt)
    assets = Decimal("0")
    liabilities = Decimal("0")
    equity = Decimal("0")
    for row in res.all():
        dr = q2(row.dr)
        cr = q2(row.cr)
        at = row.account_type
        if at == AccountType.ASSET:
            assets += dr - cr
        elif at == AccountType.LIABILITY:
            liabilities += cr - dr
        elif at == AccountType.EQUITY:
            equity += cr - dr

    acct_stmt2 = (
        select(
            ChartAccount.id,
            ChartAccount.code,
            ChartAccount.name,
            ChartAccount.account_type,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("dr"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("cr"),
        )
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(ChartAccount, ChartAccount.id == JournalEntryLine.account_id)
        .where(
            JournalEntry.entry_date <= as_of,
            cast(ChartAccount.account_type, String).in_(
                [
                    AccountType.ASSET.value,
                    AccountType.LIABILITY.value,
                    AccountType.EQUITY.value,
                ]
            ),
        )
    )
    if branch_id is not None:
        acct_stmt2 = acct_stmt2.where(JournalEntryLine.branch_id == branch_id)
    acct_stmt2 = acct_stmt2.group_by(
        ChartAccount.id,
        ChartAccount.code,
        ChartAccount.name,
        ChartAccount.account_type,
    )
    a2 = await db.execute(acct_stmt2)
    asset_lines: list[dict] = []
    liability_lines: list[dict] = []
    equity_lines: list[dict] = []
    for row in a2.all():
        dr, cr = q2(row.dr), q2(row.cr)
        at = row.account_type
        at_s = at.value if isinstance(at, AccountType) else str(at)
        if at == AccountType.ASSET:
            amt = dr - cr
        elif at == AccountType.LIABILITY:
            amt = cr - dr
        else:
            amt = cr - dr
        if amt == 0:
            continue
        line = {
            "account_id": row.id,
            "code": row.code,
            "name": row.name,
            "account_type": at_s,
            "amount": q2(amt),
        }
        if at == AccountType.ASSET:
            asset_lines.append(line)
        elif at == AccountType.LIABILITY:
            liability_lines.append(line)
        else:
            equity_lines.append(line)
    return {
        "as_of": as_of.isoformat(),
        "total_assets": q2(assets),
        "total_liabilities": q2(liabilities),
        "total_equity": q2(equity),
        "assets_minus_liabilities_equity": q2(assets - liabilities - equity),
        "asset_lines": asset_lines,
        "liability_lines": liability_lines,
        "equity_lines": equity_lines,
    }
