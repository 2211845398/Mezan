"""Pydantic schemas for purchase orders (Epic 2)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PurchaseOrderLineBase(BaseModel):
    product_id: int
    qty: int = Field(gt=0)
    unit_cost: float = Field(gt=0)


class PurchaseOrderLineCreate(PurchaseOrderLineBase):
    pass


class PurchaseOrderLineRead(PurchaseOrderLineBase):
    id: int

    model_config = {"from_attributes": True}


class PurchaseOrderBase(BaseModel):
    supplier_name: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=1024)
    expected_at: datetime | None = None


class PurchaseOrderCreate(PurchaseOrderBase):
    lines: list[PurchaseOrderLineCreate] = Field(default_factory=list)


class PurchaseOrderUpdate(BaseModel):
    supplier_name: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=1024)
    expected_at: datetime | None = None
    lines: list[PurchaseOrderLineCreate] | None = None


class PurchaseOrderRead(PurchaseOrderBase):
    id: int
    status: str
    sent_at: datetime | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
    lines: list[PurchaseOrderLineRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}
