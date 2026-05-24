"""Response schemas for stock-on-hand reporting (WAVG display-only)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_serializer


class StockMovementLedgerRead(BaseModel):
    id: int
    branch_id: int
    product_id: int
    qty_delta: int
    reason: str
    ref_type: str | None
    ref_id: str | None
    movement_kind: str | None
    notes: str | None
    user_id: int | None
    reserved_delta: int | None
    damaged_delta: int | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    def _ser_created(self, v: datetime) -> str:
        return v.isoformat()


class StockOnHandRowRead(BaseModel):
    """Per branch/product/variant row: quantities, policy hints, and WAVG cost display."""

    branch_id: int
    branch_name: str
    product_id: int
    variant_id: int
    sku: str
    variant_sku: str = ""
    variant_attributes: str = ""
    variant_name: str = ""
    reference_code: str = ""
    product_name: str
    product_image_url: str | None = Field(
        default=None,
        description="Product catalog image URL; display-only.",
    )
    category_id: int
    category_name: str
    on_hand: int
    reserved: int
    damaged: int
    available: int
    unit_cost: Decimal = Field(
        description="WAVG from branch_product_costs with standard_cost fallback; display-only."
    )
    extended_cost: Decimal = Field(
        description="on_hand * unit_cost; display-only (no FIFO/LIFO layers)."
    )
    on_order: int = 0
    in_transit_in: int = 0
    in_transit_out: int = 0
    reorder_point: int | None = None
    reorder_qty: int | None = None
    preferred_supplier_id: int | None = None
    reorder_status: str = "none"
    days_of_cover: float | None = None
    consumption_rate_30d: float = Field(
        default=0.0, description="Average units consumed per day over last 30d (issues/sales)."
    )

    @field_serializer("unit_cost", "extended_cost")
    def _serialize_decimals(self, v: Decimal) -> str:
        return str(v)

    @field_serializer("days_of_cover")
    def _serialize_cover(self, v: float | None) -> float | None:
        return v


class StockCardBranchRow(BaseModel):
    branch_id: int
    branch_name: str
    on_hand: int
    reserved: int
    damaged: int
    available: int
    on_order: int
    in_transit_in: int
    in_transit_out: int
    reorder_point: int | None
    reorder_qty: int | None
    preferred_supplier_id: int | None
    reorder_status: str
    days_of_cover: float | None
    consumption_rate_30d: float


class StockCardRead(BaseModel):
    product_id: int
    sku: str
    product_name: str
    category_id: int
    category_name: str
    branches: list[StockCardBranchRow]
    recent_movements: list[StockMovementLedgerRead]
