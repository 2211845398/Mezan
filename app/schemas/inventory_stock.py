"""Response schemas for stock-on-hand reporting (WAVG display-only)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field, field_serializer


class StockOnHandRowRead(BaseModel):
    """Per branch/product row: on-hand quantity and weighted-average cost display."""

    branch_id: int
    product_id: int
    sku: str
    product_name: str
    category_id: int
    category_name: str
    on_hand: int
    unit_cost: Decimal = Field(
        description="WAVG from branch_product_costs with standard_cost fallback; display-only."
    )
    extended_cost: Decimal = Field(
        description="on_hand * unit_cost; display-only (no FIFO/LIFO layers)."
    )

    @field_serializer("unit_cost", "extended_cost")
    def _serialize_decimals(self, v: Decimal) -> str:
        return str(v)
