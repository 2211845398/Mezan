"""Executive BI-style aggregates (Epic 5.6). Read-only."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sales_invoice import SalesInvoice


async def executive_sales_kpis(
    db: AsyncSession,
    *,
    period_start: date | None = None,
    period_end: date | None = None,
    branch_id: int | None = None,
) -> dict:
    """Revenue and invoice counts from posted sales (operational source)."""
    stmt = select(
        func.count(SalesInvoice.id).label("invoice_count"),
        func.coalesce(func.sum(SalesInvoice.total), 0).label("gross_sales"),
    )
    if period_start is not None:
        stmt = stmt.where(func.date(SalesInvoice.created_at) >= period_start)
    if period_end is not None:
        stmt = stmt.where(func.date(SalesInvoice.created_at) <= period_end)
    if branch_id is not None:
        stmt = stmt.where(SalesInvoice.branch_id == branch_id)
    res = await db.execute(stmt)
    row = res.one()
    return {
        "invoice_count": int(row.invoice_count),
        "gross_sales": float(row.gross_sales),
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "branch_id": branch_id,
    }
