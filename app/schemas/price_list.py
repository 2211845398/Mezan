"""Pydantic schemas for named price lists (W-5.3)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class PriceListLineCreate(BaseModel):
    product_id: int
    unit_price: Decimal = Field(gt=0, description="Major units; 2 d.p. in DB.")
    currency_id: int | None = None


class PriceListLineUpdate(BaseModel):
    unit_price: Decimal | None = Field(default=None, gt=0)
    currency_id: int | None = None


class PriceListLineRead(BaseModel):
    id: int
    price_list_id: int
    product_id: int
    unit_price: Decimal
    currency_id: int | None

    model_config = {"from_attributes": True}


class PriceListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    effective_from: date
    effective_to: date | None = None
    is_active: bool = True
    branch_ids: list[int] = Field(default_factory=list)
    lines: list[PriceListLineCreate] = Field(default_factory=list)


class PriceListUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    effective_from: date | None = None
    effective_to: date | None = None
    is_active: bool | None = None
    branch_ids: list[int] | None = None


class PriceListSummaryRead(BaseModel):
    id: int
    name: str
    effective_from: date
    effective_to: date | None
    is_active: bool
    branch_count: int
    line_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": False}


class PriceListRead(BaseModel):
    id: int
    name: str
    effective_from: date
    effective_to: date | None
    is_active: bool
    branch_ids: list[int]
    lines: list[PriceListLineRead]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": False}
