"""List/detail journal entries and chart of accounts for admin UI (Epic W-5.6)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError
from app.models.chart_accounts import AccountType, ChartAccount
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.utils.money import q2


@dataclass(frozen=True, slots=True)
class JournalListRow:
    id: int
    entry_date: date
    description: str
    source_type: str
    source_id: str
    total_debit: Decimal
    total_credit: Decimal
    reverses_entry_id: int | None
    reversed_by_entry_id: int | None


async def list_journal_entries(
    db: AsyncSession,
    *,
    date_from: date,
    date_to: date,
    branch_id: int | None = None,
    source_type_prefix: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[JournalListRow], int]:
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)

    line_totals = (
        select(
            JournalEntryLine.journal_entry_id.label("je_id"),
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("td"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("tc"),
        ).group_by(JournalEntryLine.journal_entry_id)
    ).subquery()

    j = JournalEntry
    base = (
        select(
            j.id,
            j.entry_date,
            j.description,
            j.source_type,
            j.source_id,
            j.reverses_entry_id,
            func.coalesce(line_totals.c.td, 0).label("total_debit"),
            func.coalesce(line_totals.c.tc, 0).label("total_credit"),
        )
        .select_from(j)
        .outerjoin(line_totals, line_totals.c.je_id == j.id)
        .where(and_(j.entry_date >= date_from, j.entry_date <= date_to))
    )

    if branch_id is not None:
        b_sub = (
            select(JournalEntryLine.journal_entry_id)
            .where(JournalEntryLine.branch_id == branch_id)
            .distinct()
        )
        base = base.where(j.id.in_(b_sub))
    if source_type_prefix:
        base = base.where(j.source_type.ilike(f"{source_type_prefix}%"))

    subq = base.subquery()
    count_stmt = select(func.count()).select_from(subq)
    count_res = await db.execute(count_stmt)
    total = int(count_res.scalar() or 0)

    paged = base.order_by(j.entry_date.desc(), j.id.desc()).limit(limit).offset(offset)
    res = await db.execute(paged)
    raw_rows = res.all()

    if not raw_rows:
        return [], total

    entry_ids = [r.id for r in raw_rows]
    rev_res = await db.execute(
        select(JournalEntry.id, JournalEntry.reverses_entry_id).where(
            JournalEntry.reverses_entry_id.in_(entry_ids)
        )
    )
    rev_map: dict[int, int] = {}
    for row in rev_res.all():
        rev_map[int(row.reverses_entry_id)] = int(row.id)

    out: list[JournalListRow] = []
    for r in raw_rows:
        td, tc = r.total_debit, r.total_credit
        dr = q2(td if isinstance(td, Decimal) else Decimal(str(td)))
        cr_ = q2(tc if isinstance(tc, Decimal) else Decimal(str(tc)))
        out.append(
            JournalListRow(
                id=r.id,
                entry_date=r.entry_date,
                description=r.description,
                source_type=r.source_type,
                source_id=r.source_id,
                total_debit=dr,
                total_credit=cr_,
                reverses_entry_id=r.reverses_entry_id,
                reversed_by_entry_id=rev_map.get(r.id),
            )
        )
    return out, total


@dataclass(frozen=True, slots=True)
class JournalLineDetail:
    line_no: int
    account_id: int
    code: str
    name: str
    account_type: str
    branch_id: int
    debit: Decimal
    credit: Decimal
    memo: str | None


@dataclass(frozen=True, slots=True)
class JournalEntryDetail:
    id: int
    entry_date: date
    description: str
    source_type: str
    source_id: str
    reverses_entry_id: int | None
    reversed_by_entry_id: int | None
    lines: list[JournalLineDetail]


async def get_journal_entry_detail(
    db: AsyncSession, *, journal_entry_id: int
) -> JournalEntryDetail:
    res = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.id == journal_entry_id)
    )
    je = res.scalar_one_or_none()
    if not je:
        raise NotFoundError(
            "Journal entry not found", details={"journal_entry_id": journal_entry_id}
        )

    acc_ids = {ln.account_id for ln in je.lines}
    acc_res = await db.execute(select(ChartAccount).where(ChartAccount.id.in_(acc_ids)))
    acc_by_id = {a.id: a for a in acc_res.scalars().all()}

    r2 = await db.execute(
        select(JournalEntry.id).where(JournalEntry.reverses_entry_id == journal_entry_id)
    )
    rev_id = r2.scalar_one_or_none()

    lines: list[JournalLineDetail] = []
    for ln in sorted(je.lines, key=lambda x: x.line_no):
        acc = acc_by_id.get(ln.account_id)
        if not acc:
            continue
        at = acc.account_type
        at_s = at.value if isinstance(at, AccountType) else str(at)
        lines.append(
            JournalLineDetail(
                line_no=ln.line_no,
                account_id=ln.account_id,
                code=acc.code,
                name=acc.name,
                account_type=at_s,
                branch_id=ln.branch_id,
                debit=q2(ln.debit),
                credit=q2(ln.credit),
                memo=ln.memo,
            )
        )
    return JournalEntryDetail(
        id=je.id,
        entry_date=je.entry_date,
        description=je.description,
        source_type=je.source_type,
        source_id=je.source_id,
        reverses_entry_id=je.reverses_entry_id,
        reversed_by_entry_id=int(rev_id) if rev_id is not None else None,
        lines=lines,
    )


async def list_chart_accounts(
    db: AsyncSession, *, include_inactive: bool = False
) -> list[ChartAccount]:
    q = select(ChartAccount).order_by(ChartAccount.code)
    if not include_inactive:
        q = q.where(ChartAccount.active.is_(True))
    res = await db.execute(q)
    return list(res.scalars().all())
