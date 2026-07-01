"""Analytics and dashboard read-model service (Epic 6).

All functions are read-only aggregation queries -- no commits.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discount import DiscountRule, DiscountUsageLog
from app.models.product import Product
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.models.stock_level import StockLevel
from app.utils.date_sql import calendar_day_range
from app.utils.money import q2


async def get_top_selling_products(
    db: AsyncSession,
    *,
    limit: int = 10,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    branch_id: int | None = None,
) -> list[dict]:
    """Top products by total quantity sold within inclusive calendar-day bounds."""
    stmt = (
        select(
            SalesInvoiceLine.product_id,
            Product.name.label("product_name"),
            func.sum(SalesInvoiceLine.qty).label("total_qty_sold"),
            func.sum(SalesInvoiceLine.line_total).label("total_revenue"),
        )
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceLine.sales_invoice_id)
        .join(Product, Product.id == SalesInvoiceLine.product_id)
        .where(SalesInvoice.voided_at.is_(None))
        .group_by(SalesInvoiceLine.product_id, Product.name)
        .order_by(func.sum(SalesInvoiceLine.qty).desc())
        .limit(limit)
    )

    if period_start is not None or period_end is not None:
        stmt = stmt.where(
            *calendar_day_range(
                SalesInvoice.created_at,
                start=period_start,
                end=period_end,
            )
        )
    if branch_id is not None:
        stmt = stmt.where(SalesInvoice.branch_id == branch_id)

    result = await db.execute(stmt)
    return [
        {
            "product_id": row.product_id,
            "product_name": row.product_name,
            "total_qty_sold": int(row.total_qty_sold),
            "total_revenue": q2(row.total_revenue or Decimal("0")),
        }
        for row in result.all()
    ]


async def get_slow_moving_products(
    db: AsyncSession,
    *,
    threshold_qty: int = 5,
    limit: int = 20,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    branch_id: int | None = None,
) -> list[dict]:
    """Products whose total sold quantity is at or below the threshold."""
    sold_base = (
        select(
            SalesInvoiceLine.product_id,
            func.coalesce(func.sum(SalesInvoiceLine.qty), 0).label("total_qty_sold"),
            func.max(SalesInvoiceLine.id).label("last_line_id"),
        )
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceLine.sales_invoice_id)
        .where(SalesInvoice.voided_at.is_(None))
    )
    if period_start is not None or period_end is not None:
        sold_base = sold_base.where(
            *calendar_day_range(
                SalesInvoice.created_at,
                start=period_start,
                end=period_end,
            )
        )
    if branch_id is not None:
        sold_base = sold_base.where(SalesInvoice.branch_id == branch_id)
    sold_subq = sold_base.group_by(SalesInvoiceLine.product_id).subquery()

    stmt = (
        select(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            func.coalesce(sold_subq.c.total_qty_sold, 0).label("total_qty_sold"),
        )
        .outerjoin(sold_subq, sold_subq.c.product_id == Product.id)
        .where(func.coalesce(sold_subq.c.total_qty_sold, 0) <= threshold_qty)
        .where(Product.status == "active")
        .order_by(func.coalesce(sold_subq.c.total_qty_sold, 0).asc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    return [
        {
            "product_id": row.product_id,
            "product_name": row.product_name,
            "total_qty_sold": int(row.total_qty_sold),
            "last_sold_at": None,
        }
        for row in result.all()
    ]


async def get_inventory_alerts(
    db: AsyncSession,
    *,
    days_ahead: int = 30,
) -> list[dict]:
    """Stock items expiring within `days_ahead` days."""
    cutoff = date.today() + timedelta(days=days_ahead)

    stmt = (
        select(
            StockLevel.product_id,
            Product.name.label("product_name"),
            StockLevel.branch_id,
            StockLevel.on_hand,
            StockLevel.expiry_date,
        )
        .join(Product, Product.id == StockLevel.product_id)
        .where(StockLevel.expiry_date.isnot(None))
        .where(StockLevel.expiry_date <= cutoff)
        .where(StockLevel.on_hand > 0)
        .order_by(StockLevel.expiry_date.asc())
    )

    result = await db.execute(stmt)
    today = date.today()
    return [
        {
            "product_id": row.product_id,
            "product_name": row.product_name,
            "branch_id": row.branch_id,
            "on_hand": row.on_hand,
            "expiry_date": row.expiry_date,
            "days_until_expiry": (row.expiry_date - today).days if row.expiry_date else None,
        }
        for row in result.all()
    ]


async def get_promotion_performance(
    db: AsyncSession,
    *,
    limit: int = 20,
) -> list[dict]:
    """Usage counts and total discount amounts per discount rule."""
    stmt = (
        select(
            DiscountRule.id.label("discount_rule_id"),
            DiscountRule.name,
            DiscountRule.code,
            DiscountRule.usage_count,
            func.coalesce(func.sum(DiscountUsageLog.discount_amount), 0).label(
                "total_discount_given"
            ),
        )
        .outerjoin(DiscountUsageLog, DiscountUsageLog.discount_rule_id == DiscountRule.id)
        .group_by(DiscountRule.id, DiscountRule.name, DiscountRule.code, DiscountRule.usage_count)
        .order_by(DiscountRule.usage_count.desc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    return [
        {
            "discount_rule_id": row.discount_rule_id,
            "name": row.name,
            "code": row.code,
            "usage_count": row.usage_count,
            "total_discount_given": q2(row.total_discount_given or Decimal("0")),
        }
        for row in result.all()
    ]


async def get_sales_period_summary(
    db: AsyncSession,
    *,
    period_start: datetime,
    period_end: datetime,
    branch_id: int | None = None,
) -> dict:
    """Invoice count, revenue, and average basket for a calendar-day window."""
    stmt = (
        select(
            func.count(SalesInvoice.id).label("invoice_count"),
            func.coalesce(func.sum(SalesInvoice.total), 0).label("total_revenue"),
            func.coalesce(func.avg(SalesInvoice.total), 0).label("avg_basket"),
        )
        .where(SalesInvoice.voided_at.is_(None))
        .where(
            *calendar_day_range(
                SalesInvoice.created_at,
                start=period_start,
                end=period_end,
            )
        )
    )
    if branch_id is not None:
        stmt = stmt.where(SalesInvoice.branch_id == branch_id)
    result = await db.execute(stmt)
    row = result.one()
    return {
        "invoice_count": int(row.invoice_count or 0),
        "total_revenue": q2(row.total_revenue or Decimal("0")),
        "avg_basket": q2(row.avg_basket or Decimal("0")),
    }


async def get_customer_purchase_aggregates(
    db: AsyncSession,
    *,
    period_start: datetime,
    period_end: datetime,
    branch_id: int | None = None,
) -> dict:
    """Anonymous customer KPIs — no names, phones, or individual IDs in output."""
    stmt = (
        select(
            SalesInvoice.customer_id,
            func.count().label("purchase_count"),
            func.sum(SalesInvoice.total).label("total_spent"),
        )
        .where(SalesInvoice.voided_at.is_(None))
        .where(SalesInvoice.customer_id.isnot(None))
        .where(
            *calendar_day_range(
                SalesInvoice.created_at,
                start=period_start,
                end=period_end,
            )
        )
        .group_by(SalesInvoice.customer_id)
    )
    if branch_id is not None:
        stmt = stmt.where(SalesInvoice.branch_id == branch_id)
    result = await db.execute(stmt)
    rows = result.all()
    if not rows:
        return {
            "active_customers": 0,
            "repeat_customers": 0,
            "repeat_rate_pct": 0.0,
            "avg_order_value": q2(Decimal("0")),
        }
    total_invoices = sum(int(r.purchase_count) for r in rows)
    repeat = sum(1 for r in rows if int(r.purchase_count) >= 2)
    total_rev = sum(Decimal(r.total_spent or 0) for r in rows)
    return {
        "active_customers": len(rows),
        "repeat_customers": repeat,
        "repeat_rate_pct": round(repeat / len(rows) * 100, 1),
        "avg_order_value": q2(total_rev / total_invoices) if total_invoices else q2(Decimal("0")),
    }
