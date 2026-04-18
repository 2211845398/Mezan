"""Pydantic schemas for analytics dashboard read models (Epic 6)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# Top-selling / slow-moving products
# ---------------------------------------------------------------------------


class TopSellingProductItem(BaseModel):
    product_id: int
    product_name: str
    total_qty_sold: int
    total_revenue: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class SlowMovingProductItem(BaseModel):
    product_id: int
    product_name: str
    total_qty_sold: int
    last_sold_at: datetime | None = None


class TopSellingProductsResponse(BaseModel):
    items: list[TopSellingProductItem]
    period_start: datetime | None = None
    period_end: datetime | None = None


class SlowMovingProductsResponse(BaseModel):
    items: list[SlowMovingProductItem]
    threshold_qty: int


# ---------------------------------------------------------------------------
# Inventory expiry alerts
# ---------------------------------------------------------------------------


class InventoryAlertItem(BaseModel):
    product_id: int
    product_name: str
    branch_id: int
    on_hand: int
    expiry_date: datetime | None = None
    days_until_expiry: int | None = None


class InventoryAlertsResponse(BaseModel):
    items: list[InventoryAlertItem]
    alert_within_days: int


# ---------------------------------------------------------------------------
# Promotion / discount performance
# ---------------------------------------------------------------------------


class PromotionPerformanceItem(BaseModel):
    discount_rule_id: int
    name: str
    code: str
    usage_count: int
    total_discount_given: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class PromotionPerformanceResponse(BaseModel):
    items: list[PromotionPerformanceItem]
