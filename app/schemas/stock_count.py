"""Pydantic schemas for stock count sessions."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class StockCountSessionCreate(BaseModel):
    branch_id: int
    category_id: int | None = None
    category_include_descendants: bool = False
    product_ids: list[int] | None = None
    responsible_name: str = Field(default="", max_length=128)


class StockCountLineRead(BaseModel):
    id: int
    product_id: int
    variant_id: int
    product_name: str
    variant_name: str
    reference_code: str
    system_on_hand: int
    system_reserved: int
    system_damaged: int
    counted_qty: int | None = None
    damaged_counted: int | None = None
    notes: str | None = None
    variance: int | None = None


class StockCountLineUpdate(BaseModel):
    id: int
    counted_qty: int | None = None
    damaged_counted: int | None = None
    notes: str | None = Field(default=None, max_length=512)


class StockCountLinesPatch(BaseModel):
    lines: list[StockCountLineUpdate]


class StockCountSessionRead(BaseModel):
    id: int
    branch_id: int
    branch_name: str = ""
    version_no: int
    status: str
    category_id: int | None = None
    responsible_name: str
    created_by: int | None = None
    created_at: datetime
    posted_at: datetime | None = None
    line_count: int = 0


class StockCountSessionDetailRead(StockCountSessionRead):
    lines: list[StockCountLineRead] = Field(default_factory=list)


class StockCountPostResult(BaseModel):
    session_id: int
    movements_posted: int
