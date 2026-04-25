"""Supplier master schemas (Epic 5 + W-5.4)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SupplierCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    currency_id: int
    payables_account_id: int | None = None
    tax_id: str | None = Field(default=None, max_length=64)
    contact: dict[str, Any] = Field(default_factory=dict)
    payment_terms: str | None = Field(default=None, max_length=512)


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    currency_id: int | None = None
    payables_account_id: int | None = None
    tax_id: str | None = Field(default=None, max_length=64)
    contact: dict[str, Any] | None = None
    payment_terms: str | None = Field(default=None, max_length=512)


class SupplierRead(BaseModel):
    id: int
    code: str
    name: str
    currency_id: int
    payables_account_id: int | None
    tax_id: str | None
    contact: dict[str, Any]
    payment_terms: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

