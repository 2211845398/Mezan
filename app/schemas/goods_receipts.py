"""Schemas for goods receipts (W-5.4)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class GoodsReceiptLineRead(BaseModel):
    id: int
    purchase_order_line_id: int | None
    product_id: int
    variant_id: int
    qty: int
    unit_cost: Decimal

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class GoodsReceiptRead(BaseModel):
    id: int
    purchase_order_id: int | None
    branch_id: int
    supplier_name: str | None
    supplier_id: int | None
    source_invoice_scan_id: int | None
    created_by_user_id: int | None
    created_at: datetime
    lines: list[GoodsReceiptLineRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class GoodsReceiptReceiveLine(BaseModel):
    purchase_order_line_id: int = Field(gt=0)
    qty: int = Field(gt=0)
    unit_cost: Decimal = Field(gt=0, description="Unit cost applied at receipt (valuation).")
    variant_id: int | None = Field(
        default=None,
        description="Required when the PO line has no preset variant_id; ignored otherwise.",
    )


class GoodsReceiptReceiveRequest(BaseModel):
    branch_id: int
    lines: list[GoodsReceiptReceiveLine] = Field(min_length=1)
    idempotency_key: str = Field(min_length=8, max_length=128)
