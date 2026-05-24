"""Supplier AP statement of account and evaluation metrics."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, cast, exists, func, or_, select
from sqlalchemy.types import Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.ap_open_item import ApOpenItem
from app.models.ap_payment_application import ApPaymentApplication
from app.models.goods_receipt import GoodsReceipt
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.suppliers import Supplier
from app.schemas.supplier_statement import (
    SupplierEvaluationRead,
    SupplierStatementLineRead,
    SupplierStatementRead,
)
from app.services.accounting_service import get_accounting_settings
from app.utils.money import q2


@dataclass(frozen=True)
class _StatementRow:
    entry_date: date
    journal_entry_id: int
    description: str
    source_type: str
    source_id: str
    debit: Decimal
    credit: Decimal
    reference: str


async def _get_supplier(db: AsyncSession, supplier_id: int) -> Supplier:
    res = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = res.scalar_one_or_none()
    if not supplier:
        raise NotFoundError("Supplier not found", details={"supplier_id": supplier_id})
    return supplier


def _supplier_entry_clause(supplier_id: int, *, dedicated_account: bool):
    """Restrict journal entries to this supplier when AP account is shared."""
    if dedicated_account:
        return None
    gr_link = exists(
        select(GoodsReceipt.id).where(
            GoodsReceipt.supplier_id == supplier_id,
            GoodsReceipt.id == cast(JournalEntry.source_id, Integer),
            JournalEntry.source_type == "goods_receipt",
        )
    )
    pay_link = exists(
        select(ApPaymentApplication.id)
        .join(ApOpenItem, ApOpenItem.id == ApPaymentApplication.ap_open_item_id)
        .where(
            ApOpenItem.supplier_id == supplier_id,
            ApPaymentApplication.id == cast(JournalEntry.source_id, Integer),
            JournalEntry.source_type == "ap_payment_application",
        )
    )
    ap_item_link = exists(
        select(ApOpenItem.id).where(
            ApOpenItem.supplier_id == supplier_id,
            ApOpenItem.id == cast(JournalEntry.source_id, Integer),
            JournalEntry.source_type == "ap_open_item",
        )
    )
    return or_(gr_link, pay_link, ap_item_link)


async def _resolve_reference(
    db: AsyncSession,
    *,
    source_type: str,
    source_id: str,
) -> str:
    if source_type == "goods_receipt":
        try:
            gr_id = int(source_id)
        except ValueError:
            return f"GR-{source_id}"
        res = await db.execute(select(GoodsReceipt).where(GoodsReceipt.id == gr_id))
        gr = res.scalar_one_or_none()
        if gr and gr.invoice_number:
            return gr.invoice_number
        return f"GR-{gr_id}"
    if source_type == "ap_payment_application":
        try:
            app_id = int(source_id)
        except ValueError:
            return f"PAY-{source_id}"
        res = await db.execute(
            select(ApPaymentApplication).where(ApPaymentApplication.id == app_id)
        )
        app = res.scalar_one_or_none()
        if app and app.reference:
            return app.reference
        return f"PAY-{app_id}"
    if source_type == "ap_open_item":
        return f"AP-{source_id}"
    return f"{source_type}:{source_id}"


async def _fetch_ap_lines(
    db: AsyncSession,
    *,
    supplier_id: int,
    ap_account_id: int,
    dedicated_account: bool,
    date_from: date | None = None,
    date_to: date | None = None,
    date_before: date | None = None,
    branch_id: int | None = None,
) -> list[_StatementRow]:
    where_clauses = [JournalEntryLine.account_id == ap_account_id]
    supplier_clause = _supplier_entry_clause(supplier_id, dedicated_account=dedicated_account)
    if supplier_clause is not None:
        where_clauses.append(supplier_clause)
    stmt = (
        select(
            JournalEntry.entry_date,
            JournalEntry.id,
            JournalEntry.description,
            JournalEntry.source_type,
            JournalEntry.source_id,
            JournalEntryLine.debit,
            JournalEntryLine.credit,
        )
        .join(JournalEntryLine, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(*where_clauses)
        .order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc(), JournalEntryLine.line_no.asc())
    )
    if date_from is not None:
        stmt = stmt.where(JournalEntry.entry_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(JournalEntry.entry_date <= date_to)
    if date_before is not None:
        stmt = stmt.where(JournalEntry.entry_date < date_before)
    if branch_id is not None:
        stmt = stmt.where(JournalEntryLine.branch_id == branch_id)

    res = await db.execute(stmt)
    out: list[_StatementRow] = []
    for row in res.all():
        entry_date, je_id, desc, st, sid, debit, credit = row
        ref = await _resolve_reference(db, source_type=st, source_id=sid)
        out.append(
            _StatementRow(
                entry_date=entry_date,
                journal_entry_id=int(je_id),
                description=str(desc or ""),
                source_type=str(st),
                source_id=str(sid),
                debit=q2(debit),
                credit=q2(credit),
                reference=ref,
            )
        )
    return out


def _running_balance_lines(
    rows: list[_StatementRow],
    *,
    opening: Decimal,
) -> tuple[list[SupplierStatementLineRead], Decimal]:
    balance = q2(opening)
    lines: list[SupplierStatementLineRead] = []
    for r in rows:
        balance = q2(balance + r.credit - r.debit)
        lines.append(
            SupplierStatementLineRead(
                entry_date=r.entry_date,
                reference=r.reference,
                description=r.description,
                debit=r.debit,
                credit=r.credit,
                running_balance=balance,
                source_type=r.source_type,
                source_id=r.source_id,
                journal_entry_id=r.journal_entry_id,
            )
        )
    return lines, balance


async def get_supplier_statement(
    db: AsyncSession,
    *,
    supplier_id: int,
    date_from: date,
    date_to: date,
    branch_id: int | None = None,
) -> SupplierStatementRead:
    supplier = await _get_supplier(db, supplier_id)
    settings = await get_accounting_settings(db)
    ap_account_id = supplier.payables_account_id or settings.default_ap_account_id
    dedicated = supplier.payables_account_id is not None

    prior_rows = await _fetch_ap_lines(
        db,
        supplier_id=supplier_id,
        ap_account_id=ap_account_id,
        dedicated_account=dedicated,
        date_before=date_from,
        branch_id=branch_id,
    )
    opening = Decimal("0")
    for r in prior_rows:
        opening = q2(opening + r.credit - r.debit)

    period_rows = await _fetch_ap_lines(
        db,
        supplier_id=supplier_id,
        ap_account_id=ap_account_id,
        dedicated_account=dedicated,
        date_from=date_from,
        date_to=date_to,
        branch_id=branch_id,
    )
    lines, closing = _running_balance_lines(period_rows, opening=opening)

    return SupplierStatementRead(
        supplier_id=supplier_id,
        date_from=date_from,
        date_to=date_to,
        opening_balance=opening,
        closing_balance=closing,
        lines=lines,
    )


async def get_supplier_evaluation(
    db: AsyncSession,
    *,
    supplier_id: int,
    period_days: int = 365,
    branch_id: int | None = None,
) -> SupplierEvaluationRead:
    supplier = await _get_supplier(db, supplier_id)
    settings = await get_accounting_settings(db)
    ap_account_id = supplier.payables_account_id or settings.default_ap_account_id
    dedicated = supplier.payables_account_id is not None

    period_end = date.today()
    period_start = period_end - timedelta(days=max(period_days, 1))

    period_rows = await _fetch_ap_lines(
        db,
        supplier_id=supplier_id,
        ap_account_id=ap_account_id,
        dedicated_account=dedicated,
        date_from=period_start,
        date_to=period_end,
        branch_id=branch_id,
    )
    total_purchases = q2(sum((r.credit for r in period_rows), Decimal("0")))
    total_paid = q2(sum((r.debit for r in period_rows), Decimal("0")))

    open_stmt = select(func.coalesce(func.sum(ApOpenItem.amount_open), 0)).where(
        ApOpenItem.supplier_id == supplier_id,
        ApOpenItem.amount_open > 0,
    )
    if branch_id is not None:
        open_stmt = open_stmt.where(ApOpenItem.branch_id == branch_id)
    open_res = await db.execute(open_stmt)
    open_balance = q2(Decimal(open_res.scalar_one() or 0))

    pay_count_stmt = (
        select(func.count(ApPaymentApplication.id))
        .join(ApOpenItem, ApOpenItem.id == ApPaymentApplication.ap_open_item_id)
        .where(
            ApOpenItem.supplier_id == supplier_id,
            ApPaymentApplication.applied_at >= period_start,
        )
    )
    if branch_id is not None:
        pay_count_stmt = pay_count_stmt.where(ApOpenItem.branch_id == branch_id)
    pay_count_res = await db.execute(pay_count_stmt)
    payment_count = int(pay_count_res.scalar_one() or 0)

    gr_count_stmt = select(func.count(GoodsReceipt.id)).where(
        GoodsReceipt.supplier_id == supplier_id,
        func.date(GoodsReceipt.created_at) >= period_start,
    )
    if branch_id is not None:
        gr_count_stmt = gr_count_stmt.where(GoodsReceipt.branch_id == branch_id)
    gr_count_res = await db.execute(gr_count_stmt)
    receipt_count = int(gr_count_res.scalar_one() or 0)

    avg_days_stmt = (
        select(
            func.avg(
                func.date(ApPaymentApplication.applied_at) - ApOpenItem.due_date
            )
        )
        .join(ApOpenItem, ApOpenItem.id == ApPaymentApplication.ap_open_item_id)
        .where(
            ApOpenItem.supplier_id == supplier_id,
            ApOpenItem.due_date.isnot(None),
            func.date(ApPaymentApplication.applied_at) >= period_start,
        )
    )
    if branch_id is not None:
        avg_days_stmt = avg_days_stmt.where(ApOpenItem.branch_id == branch_id)
    avg_res = await db.execute(avg_days_stmt)
    avg_raw = avg_res.scalar_one_or_none()
    avg_days_to_pay = float(avg_raw) if avg_raw is not None else None

    last_dates: list[date] = []
    if period_rows:
        last_dates.append(period_rows[-1].entry_date)
    last_gr = await db.execute(
        select(func.max(func.date(GoodsReceipt.created_at))).where(
            GoodsReceipt.supplier_id == supplier_id
        )
    )
    last_gr_d = last_gr.scalar_one_or_none()
    if last_gr_d:
        last_dates.append(last_gr_d)
    last_activity = max(last_dates) if last_dates else None

    return SupplierEvaluationRead(
        supplier_id=supplier_id,
        period_days=period_days,
        total_purchases=total_purchases,
        total_paid=total_paid,
        open_balance=open_balance,
        payment_count=payment_count,
        receipt_count=receipt_count,
        avg_days_to_pay=avg_days_to_pay,
        last_activity_date=last_activity,
    )
