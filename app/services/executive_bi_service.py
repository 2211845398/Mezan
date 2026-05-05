"""Executive BI-style aggregates (Epic 5.6). Read-only."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.loyalty import LedgerEntryType, LedgerReasonCode, LoyaltyLedger
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.utils.date_sql import calendar_day_range
from app.utils.money import q2


def _invoice_filters(*, period_start: date | None, period_end: date | None, branch_id: int | None):
    parts = [
        *calendar_day_range(
            SalesInvoice.created_at,
            start=period_start,
            end=period_end,
        ),
        SalesInvoice.voided_at.is_(None),
    ]
    if branch_id is not None:
        parts.append(SalesInvoice.branch_id == branch_id)
    return parts


async def executive_sales_kpis(
    db: AsyncSession,
    *,
    period_start: date | None = None,
    period_end: date | None = None,
    branch_id: int | None = None,
) -> dict:
    """Revenue, margin estimate, trends, category mix, top products, PO snapshot, loyalty accruals."""
    inv_pred = _invoice_filters(
        period_start=period_start, period_end=period_end, branch_id=branch_id
    )

    stmt_summary = select(
        func.count(SalesInvoice.id).label("invoice_count"),
        func.coalesce(func.sum(SalesInvoice.total), 0).label("gross_sales"),
    ).where(*inv_pred)
    res_summary = await db.execute(stmt_summary)
    summary = res_summary.one()
    invoice_count = int(summary.invoice_count)
    gross_sales = q2(summary.gross_sales or Decimal("0"))

    avg_ticket = q2(gross_sales / invoice_count) if invoice_count > 0 else Decimal("0")

    stmt_cogs = (
        select(
            func.coalesce(
                func.sum(SalesInvoiceLine.qty * func.coalesce(Product.standard_cost, 0)),
                0,
            ).label("cogs"),
        )
        .select_from(SalesInvoiceLine)
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceLine.sales_invoice_id)
        .join(Product, Product.id == SalesInvoiceLine.product_id)
        .where(*inv_pred)
    )
    row_cogs = (await db.execute(stmt_cogs)).one()
    estimated_cogs = q2(row_cogs.cogs or Decimal("0"))
    gross_margin_ratio: Decimal | None
    if gross_sales > 0:
        gross_margin_ratio = q2((gross_sales - estimated_cogs) / gross_sales)
    else:
        gross_margin_ratio = None

    stmt_loyalty = (
        select(func.coalesce(func.sum(LoyaltyLedger.points), 0))
        .where(LoyaltyLedger.entry_type == LedgerEntryType.CREDIT)
        .where(LoyaltyLedger.reason_code == LedgerReasonCode.PURCHASE)
        .where(
            *calendar_day_range(
                LoyaltyLedger.created_at,
                start=period_start,
                end=period_end,
            )
        )
    )
    loyalty_points_accrued = int((await db.execute(stmt_loyalty)).scalar_one() or 0)

    stmt_trend = (
        select(
            func.date(SalesInvoice.created_at).label("bucket_date"),
            func.coalesce(func.sum(SalesInvoice.total), 0).label("gross_sales"),
        )
        .where(*inv_pred)
        .group_by(func.date(SalesInvoice.created_at))
        .order_by(func.date(SalesInvoice.created_at))
    )
    trend_rows = (await db.execute(stmt_trend)).all()
    revenue_trend = [
        {"bucket_date": r.bucket_date, "gross_sales": q2(r.gross_sales or Decimal("0"))}
        for r in trend_rows
    ]

    stmt_cat = (
        select(
            Category.id.label("category_id"),
            Category.name.label("category_name"),
            func.coalesce(func.sum(SalesInvoiceLine.line_total), 0).label("gross_sales"),
        )
        .select_from(SalesInvoiceLine)
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceLine.sales_invoice_id)
        .join(Product, Product.id == SalesInvoiceLine.product_id)
        .join(Category, Category.id == Product.category_id)
        .where(*inv_pred)
        .group_by(Category.id, Category.name)
        .order_by(func.sum(SalesInvoiceLine.line_total).desc())
    )
    cat_rows = (await db.execute(stmt_cat)).all()
    category_mix = [
        {
            "category_id": int(r.category_id),
            "category_name": str(r.category_name),
            "gross_sales": q2(r.gross_sales or Decimal("0")),
        }
        for r in cat_rows
    ]

    stmt_top = (
        select(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            func.coalesce(func.sum(SalesInvoiceLine.qty), 0).label("qty_sold"),
            func.coalesce(func.sum(SalesInvoiceLine.line_total), 0).label("revenue"),
        )
        .select_from(SalesInvoiceLine)
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceLine.sales_invoice_id)
        .join(Product, Product.id == SalesInvoiceLine.product_id)
        .where(*inv_pred)
        .group_by(Product.id, Product.name)
        .order_by(func.sum(SalesInvoiceLine.line_total).desc())
        .limit(10)
    )
    top_rows = (await db.execute(stmt_top)).all()
    top_products = [
        {
            "product_id": int(r.product_id),
            "product_name": str(r.product_name),
            "qty_sold": int(r.qty_sold or 0),
            "revenue": q2(r.revenue or Decimal("0")),
        }
        for r in top_rows
    ]

    stmt_po = select(PurchaseOrder).order_by(PurchaseOrder.created_at.desc()).limit(10)
    if branch_id is not None:
        stmt_po = stmt_po.where(PurchaseOrder.branch_id == branch_id)
    po_rows = (await db.execute(stmt_po)).scalars().all()
    recent_purchase_orders = [
        {
            "id": po.id,
            "supplier_name": po.supplier_name,
            "status": po.status,
            "branch_id": po.branch_id,
            "created_at": po.created_at,
        }
        for po in po_rows
    ]

    return {
        "invoice_count": invoice_count,
        "gross_sales": gross_sales,
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "branch_id": branch_id,
        "avg_ticket": avg_ticket,
        "estimated_cogs": estimated_cogs,
        "gross_margin_ratio": gross_margin_ratio,
        "loyalty_points_accrued": loyalty_points_accrued,
        "revenue_trend": revenue_trend,
        "category_mix": category_mix,
        "top_products": top_products,
        "recent_purchase_orders": recent_purchase_orders,
    }
