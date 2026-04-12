"""Marketing API (Epic 6): analytics dashboards and AI auto-discount."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
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
from app.services import audit_service
from app.services.analytics_service import (
    get_inventory_alerts,
    get_promotion_performance,
    get_slow_moving_products,
    get_top_selling_products,
)
from app.services.discount_service import create_ai_draft_discount

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
