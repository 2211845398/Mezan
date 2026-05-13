"""Customer performance analytics (Epic 22.1)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.ar_open_item import ArOpenItem
from app.models.customer_profile import CustomerProfile
from app.models.loyalty import LoyaltyLedger
from app.models.product import Product
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.models.sales_return import ExchangeLink, SalesReturn
from app.utils.money import q2


def _customer_display_name(c: CustomerProfile) -> str:
    return (c.full_name or "").strip() or c.phone


async def get_customer_performance(
    db: AsyncSession,
    *,
    customer_id: int,
    days_back: int = 365,
) -> dict:
    cust_res = await db.execute(select(CustomerProfile).where(CustomerProfile.id == customer_id))
    customer = cust_res.scalar_one_or_none()
    if not customer:
        raise NotFoundError("Customer not found")

    since_date = datetime.now(UTC) - timedelta(days=days_back)

    inv_res = await db.execute(
        select(SalesInvoice)
        .where(SalesInvoice.customer_id == customer_id, SalesInvoice.voided_at.is_(None))
        .order_by(SalesInvoice.created_at.desc())
    )
    invoices = list(inv_res.scalars().all())

    period_invoices = [inv for inv in invoices if inv.created_at and inv.created_at >= since_date]

    total_spend_lifetime = sum((inv.total for inv in invoices), start=Decimal("0"))
    total_spend_period = sum((inv.total for inv in period_invoices), start=Decimal("0"))
    purchase_count = len(period_invoices)
    aov = q2(total_spend_period / purchase_count) if purchase_count > 0 else Decimal("0")

    last_visit = invoices[0].created_at if invoices else None
    first_visit = invoices[-1].created_at if invoices else None

    top_products = await _get_top_products(db, customer_id=customer_id, limit=5)

    loyalty_res = await db.execute(
        select(LoyaltyLedger.balance_after)
        .where(LoyaltyLedger.customer_id == customer_id)
        .order_by(LoyaltyLedger.id.desc())
        .limit(1)
    )
    loyalty_balance = loyalty_res.scalar_one_or_none() or 0

    ar_res = await db.execute(
        select(func.coalesce(func.sum(ArOpenItem.amount_open), Decimal("0"))).where(
            ArOpenItem.customer_id == customer_id,
            ArOpenItem.amount_open > 0,
        )
    )
    debt = ar_res.scalar_one()

    days_90 = timedelta(days=90)
    days_180 = timedelta(days=180)
    now = datetime.now(UTC)

    recent_90 = [inv for inv in invoices if inv.created_at and inv.created_at >= now - days_90]
    previous_90 = [
        inv
        for inv in invoices
        if inv.created_at and now - days_180 <= inv.created_at < now - days_90
    ]

    visit_trend = "stable"
    if len(previous_90) > 0:
        ratio = len(recent_90) / len(previous_90)
        if ratio > 1.2:
            visit_trend = "increasing"
        elif ratio < 0.8:
            visit_trend = "decreasing"
    elif len(recent_90) > 0:
        visit_trend = "new"

    since_90_ex = now - timedelta(days=90)
    exch_res = await db.execute(
        select(func.count(ExchangeLink.id))
        .join(SalesReturn, SalesReturn.id == ExchangeLink.sales_return_id)
        .join(SalesInvoice, SalesInvoice.id == SalesReturn.sales_invoice_id)
        .where(
            SalesInvoice.customer_id == customer_id,
            ExchangeLink.created_at >= since_90_ex,
        )
    )
    exchanges_last_90_days = int(exch_res.scalar_one() or 0)

    return {
        "customer_id": customer_id,
        "customer_name": _customer_display_name(customer),
        "period_days": days_back,
        "metrics": {
            "total_spend_period": total_spend_period,
            "total_spend_lifetime": total_spend_lifetime,
            "purchase_count": purchase_count,
            "average_order_value": aov,
            "lifetime_value": total_spend_lifetime,
            "loyalty_points_balance": int(loyalty_balance),
            "open_debt": q2(debt),
            "exchanges_last_90_days": exchanges_last_90_days,
        },
        "visits": {
            "last_visit": last_visit.isoformat() if last_visit else None,
            "first_visit": first_visit.isoformat() if first_visit else None,
            "visit_trend": visit_trend,
            "visits_last_90_days": len(recent_90),
            "visits_previous_90_days": len(previous_90),
        },
        "top_products": top_products,
    }


async def _get_top_products(db: AsyncSession, *, customer_id: int, limit: int) -> list[dict]:
    query = (
        select(
            SalesInvoiceLine.product_id,
            func.sum(SalesInvoiceLine.qty).label("total_qty"),
            func.sum(SalesInvoiceLine.line_total).label("total_spend"),
        )
        .join(SalesInvoice, SalesInvoiceLine.sales_invoice_id == SalesInvoice.id)
        .where(SalesInvoice.customer_id == customer_id, SalesInvoice.voided_at.is_(None))
        .group_by(SalesInvoiceLine.product_id)
        .order_by(func.sum(SalesInvoiceLine.qty).desc())
        .limit(limit)
    )
    res = await db.execute(query)
    rows = res.all()
    if not rows:
        return []

    product_ids = [r.product_id for r in rows]
    prod_res = await db.execute(select(Product).where(Product.id.in_(product_ids)))
    products = {p.id: p for p in prod_res.scalars().all()}

    out: list[dict] = []
    for r in rows:
        p = products.get(r.product_id)
        out.append(
            {
                "product_id": r.product_id,
                "product_name": p.name if p else "Unknown",
                "total_qty": int(r.total_qty or 0),
                "total_spend": r.total_spend or Decimal("0"),
            }
        )
    return out


async def list_customer_performance_summary(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    min_spend: Decimal | None = None,
) -> list[dict]:
    stmt = (
        select(
            SalesInvoice.customer_id,
            func.count(SalesInvoice.id).label("purchase_count"),
            func.sum(SalesInvoice.total).label("total_spend"),
            func.max(SalesInvoice.created_at).label("last_visit"),
        )
        .where(SalesInvoice.voided_at.is_(None), SalesInvoice.customer_id.isnot(None))
        .group_by(SalesInvoice.customer_id)
    )
    if branch_id is not None:
        stmt = stmt.where(SalesInvoice.branch_id == branch_id)
    if min_spend is not None:
        stmt = stmt.having(func.sum(SalesInvoice.total) >= min_spend)

    stmt = stmt.order_by(func.sum(SalesInvoice.total).desc()).limit(limit).offset(offset)
    res = await db.execute(stmt)
    rows = res.all()
    if not rows:
        return []

    customer_ids = [r.customer_id for r in rows]
    cust_res = await db.execute(select(CustomerProfile).where(CustomerProfile.id.in_(customer_ids)))
    customers = {c.id: c for c in cust_res.scalars().all()}

    return [
        {
            "customer_id": r.customer_id,
            "customer_name": _customer_display_name(customers[r.customer_id])
            if r.customer_id in customers
            else "Unknown",
            "purchase_count": int(r.purchase_count or 0),
            "total_spend": r.total_spend or Decimal("0"),
            "last_visit": r.last_visit.isoformat() if r.last_visit else None,
        }
        for r in rows
    ]
