"""Pydantic schemas for manual inventory adjustments."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StockAdjustmentRequest(BaseModel):
    branch_id: int
    product_id: int
    qty_delta: int
    reason: str = Field(min_length=2, max_length=64)
    idempotency_key: str = Field(min_length=8, max_length=128)
