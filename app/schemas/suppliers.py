"""Supplier master schemas (Epic 5)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SupplierCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    currency_id: int
    payables_account_id: int | None = None


class SupplierRead(BaseModel):
    id: int
    code: str
    name: str
    currency_id: int
    payables_account_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
