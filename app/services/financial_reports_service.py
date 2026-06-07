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
from app.models.customer_profile import CustomerProfile
from app.models.employee_profile import EmployeeProfile
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.suppliers import Supplier
from app.utils.money import q2
from app.utils.person_name import display_person_name


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


async def trial_balance_for_period(
    db: AsyncSession,
    *,
    period_start: date,
    period_end: date,
    branch_id: int | None = None,
) -> list[dict]:
    """Per-account debit/credit totals for entry_date within [period_start, period_end]."""
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
        .where(JournalEntry.entry_date >= period_start)
        .where(JournalEntry.entry_date <= period_end)
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


async def subledger_activity_for_period(
    db: AsyncSession,
    *,
    period_start: date,
    period_end: date,
    branch_id: int | None = None,
) -> list[dict]:
    """Sub-ledger accounts with journal activity in the period."""
    from app.models.chart_accounts import SubledgerKind

    stmt = (
        select(
            JournalEntryLine.account_id,
            ChartAccount.code,
            ChartAccount.name,
            ChartAccount.subledger_kind,
            func.count(JournalEntryLine.id).label("line_count"),
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("total_credit"),
        )
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(ChartAccount, ChartAccount.id == JournalEntryLine.account_id)
        .where(JournalEntry.entry_date >= period_start)
        .where(JournalEntry.entry_date <= period_end)
        .where(ChartAccount.subledger_kind != SubledgerKind.NONE)
    )
    if branch_id is not None:
        stmt = stmt.where(JournalEntryLine.branch_id == branch_id)
    stmt = stmt.group_by(
        JournalEntryLine.account_id,
        ChartAccount.code,
        ChartAccount.name,
        ChartAccount.subledger_kind,
    ).order_by(ChartAccount.code)
    res = await db.execute(stmt)
    rows = []
    for r in res.all():
        dr = q2(r.total_debit)
        cr = q2(r.total_credit)
        sk = r.subledger_kind
        sk_s = sk.value if isinstance(sk, SubledgerKind) else str(sk)
        rows.append(
            {
                "account_id": r.account_id,
                "code": r.code,
                "name": r.name,
                "subledger_kind": sk_s,
                "line_count": int(r.line_count),
                "total_debit": dr,
                "total_credit": cr,
                "net": q2(dr - cr),
            }
        )
    return rows


async def get_ledger_report(
    db: AsyncSession,
    *,
    account_id: int,
    date_from: date,
    date_to: date,
    branch_id: int | None = None,
    customer_id: int | None = None,
    supplier_id: int | None = None,
    employee_id: int | None = None,
) -> list[dict]:
    """Posted GL lines for one account with optional sub-ledger filters and running balance."""
    return await general_ledger_lines(
        db,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
        branch_id=branch_id,
        customer_id=customer_id,
        supplier_id=supplier_id,
        employee_id=employee_id,
    )


async def general_ledger_lines(
    db: AsyncSession,
    *,
    account_id: int,
    date_from: date,
    date_to: date,
    branch_id: int | None = None,
    customer_id: int | None = None,
    supplier_id: int | None = None,
    employee_id: int | None = None,
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
            JournalEntryLine.customer_id,
            JournalEntryLine.supplier_id,
            JournalEntryLine.employee_id,
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
    if customer_id is not None:
        stmt = stmt.where(JournalEntryLine.customer_id == customer_id)
    if supplier_id is not None:
        stmt = stmt.where(JournalEntryLine.supplier_id == supplier_id)
    if employee_id is not None:
        stmt = stmt.where(JournalEntryLine.employee_id == employee_id)
    res = await db.execute(stmt)
    raw_rows = res.all()

    cust_ids = {r.customer_id for r in raw_rows if r.customer_id is not None}
    sup_ids = {r.supplier_id for r in raw_rows if r.supplier_id is not None}
    emp_ids = {r.employee_id for r in raw_rows if r.employee_id is not None}

    cust_names: dict[int, str] = {}
    if cust_ids:
        c_res = await db.execute(select(CustomerProfile).where(CustomerProfile.id.in_(cust_ids)))
        for c in c_res.scalars().all():
            cust_names[int(c.id)] = (
                display_person_name(c.first_name, c.father_name, c.family_name)
                or c.phone
                or f"#{c.id}"
            )

    sup_names: dict[int, str] = {}
    if sup_ids:
        s_res = await db.execute(
            select(
                Supplier.id,
                Supplier.code,
                Supplier.first_name,
                Supplier.father_name,
                Supplier.family_name,
            ).where(Supplier.id.in_(sup_ids))
        )
        for r in s_res.all():
            sup_names[int(r.id)] = (
                display_person_name(r.first_name, r.father_name, r.family_name)
                or r.code
                or f"#{r.id}"
            )

    emp_names: dict[int, str] = {}
    if emp_ids:
        from app.models.users import User

        e_res = await db.execute(
            select(EmployeeProfile.id, User.first_name, User.father_name, User.family_name)
            .join(User, User.id == EmployeeProfile.user_id)
            .where(EmployeeProfile.id.in_(emp_ids))
        )
        for r in e_res.all():
            emp_names[int(r.id)] = (
                display_person_name(r.first_name, r.father_name, r.family_name)
                or f"Employee #{r.id}"
            )

    running = Decimal("0")
    out: list[dict] = []
    for r in raw_rows:
        dr = q2(r.debit)
        cr = q2(r.credit)
        running = q2(running + dr - cr)
        partner_display_name = None
        if r.customer_id is not None:
            partner_display_name = cust_names.get(int(r.customer_id))
        elif r.supplier_id is not None:
            partner_display_name = sup_names.get(int(r.supplier_id))
        elif r.employee_id is not None:
            partner_display_name = emp_names.get(int(r.employee_id))

        out.append(
            {
                "journal_entry_id": r.id,
                "entry_date": r.entry_date.isoformat(),
                "description": r.description,
                "source_type": r.source_type,
                "source_id": r.source_id,
                "line_no": r.line_no,
                "debit": dr,
                "credit": cr,
                "branch_id": r.branch_id,
                "memo": r.memo,
                "customer_id": r.customer_id,
                "supplier_id": r.supplier_id,
                "employee_id": r.employee_id,
                "partner_display_name": partner_display_name,
                "running_balance": running,
            }
        )
    return out


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
