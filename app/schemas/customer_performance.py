"""Pydantic schemas for Customer Performance (Epic 22.1)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TopProductRead(BaseModel):
    product_id: int
    product_name: str
    total_qty: int
    total_spend: Decimal


class CustomerMetricsRead(BaseModel):
    total_spend_period: Decimal
    total_spend_lifetime: Decimal
    purchase_count: int
    average_order_value: Decimal
    lifetime_value: Decimal
    loyalty_points_balance: int
    open_debt: Decimal


class CustomerVisitsRead(BaseModel):
    last_visit: str | None = None
    first_visit: str | None = None
    visit_trend: str
    visits_last_90_days: int
    visits_previous_90_days: int


class CustomerPerformanceRead(BaseModel):
    customer_id: int
    customer_name: str
    period_days: int
    metrics: CustomerMetricsRead
    visits: CustomerVisitsRead
    top_products: list[TopProductRead] = []


class CustomerSummaryRead(BaseModel):
    customer_id: int
    customer_name: str
    purchase_count: int
    total_spend: Decimal
    last_visit: str | None = None


class CustomerPerformanceListRequest(BaseModel):
    branch_id: int | None = None
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    min_spend: Decimal | None = Field(None, ge=0)


class CustomerPerformanceListResponse(BaseModel):
    customers: list[CustomerSummaryRead] = []
    total: int = 0
    limit: int
    offset: int
