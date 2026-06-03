"""Marketing API (Epic 6): analytics dashboards and AI auto-discount."""

from __future__ import annotations

import time
from datetime import UTC, date, datetime, timedelta
from datetime import time as dt_time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.ai_rate_limit import AI_RATE_LIMITS
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.users import User
from app.schemas.ai_discount import AIAutoDiscountRequest, AIAutoDiscountResponse
from app.schemas.analytics import (
    InventoryAlertsResponse,
    PromotionPerformanceResponse,
    SlowMovingProductsResponse,
    TopSellingProductsResponse,
)
from app.schemas.discount import DiscountRuleRead
from app.schemas.marketing_advisory import MarketingAdvisoryRequest, MarketingAdvisoryResponse
from app.services import audit_service
from app.services.ai_call_context import finalize_advisor_run, load_cached_advisor_response
from app.services.analytics_service import (
    get_inventory_alerts,
    get_promotion_performance,
    get_slow_moving_products,
    get_top_selling_products,
)
from app.services.discount_service import create_ai_draft_discount
from app.services.marketing_advisory_service import generate_marketing_advisory

router = APIRouter()


# ── Analytics ──────────────────────────────────────────────────────────────


@router.get(
    "/marketing/analytics/top-products",
    response_model=TopSellingProductsResponse,
)
async def top_products_endpoint(
    limit: int = 10,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> TopSellingProductsResponse:
    items = await get_top_selling_products(
        db, limit=limit, period_start=period_start, period_end=period_end
    )
    return TopSellingProductsResponse(items=items, period_start=period_start, period_end=period_end)


@router.get(
    "/marketing/analytics/slow-products",
    response_model=SlowMovingProductsResponse,
)
async def slow_products_endpoint(
    threshold_qty: int = 5,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> SlowMovingProductsResponse:
    items = await get_slow_moving_products(db, threshold_qty=threshold_qty, limit=limit)
    return SlowMovingProductsResponse(items=items, threshold_qty=threshold_qty)


@router.get(
    "/marketing/analytics/inventory-alerts",
    response_model=InventoryAlertsResponse,
)
async def inventory_alerts_endpoint(
    days_ahead: int = 30,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> InventoryAlertsResponse:
    items = await get_inventory_alerts(db, days_ahead=days_ahead)
    return InventoryAlertsResponse(items=items, alert_within_days=days_ahead)


@router.get(
    "/marketing/analytics/promotion-performance",
    response_model=PromotionPerformanceResponse,
)
async def promotion_performance_endpoint(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> PromotionPerformanceResponse:
    items = await get_promotion_performance(db, limit=limit)
    return PromotionPerformanceResponse(items=items)


# ── AI auto-discount ──────────────────────────────────────────────────────


@router.post(
    "/marketing/ai-auto-discount",
    response_model=AIAutoDiscountResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ai_auto_discount_endpoint(
    body: AIAutoDiscountRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("discounts", "create"),
) -> AIAutoDiscountResponse:
    rule = await create_ai_draft_discount(db, payload=body, created_by_user_id=current_user.id)
    await audit_service.log(
        session=db,
        action="discount_rule.ai_draft_created",
        resource_type="discount_rule",
        resource_id=str(rule.id),
        new_value=DiscountRuleRead.model_validate(rule).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return AIAutoDiscountResponse(
        discount_rule=DiscountRuleRead.model_validate(rule),
    )


@router.post(
    "/marketing/advisory/suggestions",
    response_model=MarketingAdvisoryResponse,
)
@limiter.limit(AI_RATE_LIMITS["marketing_advisory"])
async def marketing_advisory_endpoint(
    request: Request,
    body: MarketingAdvisoryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("marketing_advisory", "run"),
) -> MarketingAdvisoryResponse:
    endpoint = "/api/v1/marketing/advisory/suggestions"
    cache_in = body.model_dump(mode="json")
    cached = await load_cached_advisor_response(
        db,
        endpoint=endpoint,
        cache_input=cache_in,
        response_model=MarketingAdvisoryResponse,
    )
    t0 = time.perf_counter()
    if cached is not None:
        await finalize_advisor_run(
            db,
            endpoint=endpoint,
            user_id=current_user.id,
            cache_input=cache_in,
            model=cached.model,
            response=cached,
            cache_hit=True,
            started_at_perf=t0,
            prompt_tokens=0,
            completion_tokens=0,
        )
        await db.commit()
        return cached

    result, llm_usage = await generate_marketing_advisory(db, payload=body)
    pt = llm_usage.get("prompt_tokens") if llm_usage else None
    ct = llm_usage.get("completion_tokens") if llm_usage else None
    await finalize_advisor_run(
        db,
        endpoint=endpoint,
        user_id=current_user.id,
        cache_input=cache_in,
        model=result.model,
        response=result,
        cache_hit=False,
        started_at_perf=t0,
        prompt_tokens=pt,
        completion_tokens=ct,
    )
    await db.commit()
    return result


# ── Epic 23.6: Marketing Analytics Charts (Recharts-compatible data) ────────


@router.get("/marketing/analytics/charts/sales-trend")
async def sales_trend_chart_endpoint(
    days: int = Query(30, ge=1, le=366),
    period_start: date | None = Query(
        None, description="UTC calendar day inclusive (overrides rolling `days`)"
    ),
    period_end: date | None = Query(None, description="UTC calendar day inclusive"),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> dict:
    """Get sales trend data for line/area charts (Recharts compatible).

    Returns daily sales totals for the specified period.
    When ``period_start`` and ``period_end`` are provided, filters that inclusive
    UTC date range; otherwise uses the last ``days`` from now (legacy behaviour).
    """
    from sqlalchemy import func, select

    from app.models.sales_invoice import SalesInvoice

    if period_start is not None and period_end is not None:
        if period_end < period_start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="period_end must be on or after period_start",
            )
        start_date = datetime.combine(period_start, dt_time.min, tzinfo=UTC)
        end_date = datetime.combine(period_end + timedelta(days=1), dt_time.min, tzinfo=UTC)
        time_upper = "<"
    elif period_start is not None or period_end is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide both period_start and period_end, or neither",
        )
    else:
        end_date = datetime.now(UTC)
        start_date = end_date - timedelta(days=days)
        time_upper = "<="

    stmt = (
        select(
            func.date(SalesInvoice.created_at).label("date"),
            func.sum(SalesInvoice.total).label("total"),
            func.count(SalesInvoice.id).label("count"),
        )
        .where(
            SalesInvoice.created_at >= start_date,
            SalesInvoice.voided_at.is_(None),
        )
        .group_by(func.date(SalesInvoice.created_at))
        .order_by(func.date(SalesInvoice.created_at))
    )
    if time_upper == "<":
        stmt = stmt.where(SalesInvoice.created_at < end_date)
    else:
        stmt = stmt.where(SalesInvoice.created_at <= end_date)

    result = await db.execute(stmt)
    rows = result.all()

    return {
        "period_days": days,
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "data": [
            {"date": str(r.date), "total": float(r.total or 0), "count": r.count or 0} for r in rows
        ],
    }


@router.get("/marketing/analytics/charts/category-breakdown")
async def category_breakdown_chart_endpoint(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> dict:
    """Get sales by category for pie/donut charts (Recharts compatible)."""
    from datetime import timedelta

    from sqlalchemy import func, select

    from app.models.product import Product
    from app.models.sales_invoice import SalesInvoice
    from app.models.sales_invoice_line import SalesInvoiceLine

    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    stmt = (
        select(
            Product.category_id.label("category_id"),
            func.sum(SalesInvoiceLine.line_total).label("total"),
        )
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceLine.sales_invoice_id)
        .join(Product, Product.id == SalesInvoiceLine.product_id)
        .where(
            SalesInvoice.created_at >= start_date,
            SalesInvoice.created_at <= end_date,
            SalesInvoice.voided_at.is_(None),
        )
        .group_by(Product.category_id)
        .order_by(func.sum(SalesInvoiceLine.line_total).desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    # Get category names
    from app.models.category import Category

    cat_ids = [r.category_id for r in rows if r.category_id]
    cat_result = await db.execute(
        select(Category.id, Category.name).where(Category.id.in_(cat_ids))
    )
    cat_map = {c.id: c.name for c in cat_result.scalars().all()}

    return {
        "period_days": days,
        "data": [
            {
                "category_id": r.category_id,
                "category_name": cat_map.get(r.category_id, "Unknown"),
                "value": float(r.total or 0),
            }
            for r in rows
        ],
    }


@router.get("/marketing/analytics/charts/customer-activity")
async def customer_activity_chart_endpoint(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("analytics", "read"),
) -> dict:
    """Get customer activity data for bar charts (Recharts compatible)."""
    from datetime import timedelta

    from sqlalchemy import func, select

    from app.models.sales_invoice import SalesInvoice

    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    # Hourly distribution of sales
    stmt = (
        select(
            func.extract("hour", SalesInvoice.created_at).label("hour"),
            func.count(SalesInvoice.id).label("count"),
            func.sum(SalesInvoice.total).label("total"),
        )
        .where(
            SalesInvoice.created_at >= start_date,
            SalesInvoice.created_at <= end_date,
            SalesInvoice.voided_at.is_(None),
        )
        .group_by(func.extract("hour", SalesInvoice.created_at))
        .order_by(func.extract("hour", SalesInvoice.created_at))
    )

    result = await db.execute(stmt)
    rows = result.all()

    return {
        "period_days": days,
        "data": [
            {"hour": int(r.hour), "count": r.count or 0, "total": float(r.total or 0)} for r in rows
        ],
    }
