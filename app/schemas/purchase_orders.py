"""Pydantic schemas for purchase orders (Epic 2)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PurchaseOrderLineBase(BaseModel):
    product_id: int
    variant_id: int | None = None
    qty: int = Field(gt=0)
    unit_cost: Decimal = Field(gt=0)


class PurchaseOrderLineCreate(PurchaseOrderLineBase):
    pass


class PurchaseOrderLineRead(PurchaseOrderLineBase):
    id: int

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class PurchaseOrderBase(BaseModel):
    supplier_name: str = Field(min_length=1, max_length=255)
    supplier_id: int | None = None
    branch_id: int | None = None
    notes: str | None = Field(default=None, max_length=1024)
    expected_at: datetime | None = None


class PurchaseOrderCreate(PurchaseOrderBase):
    lines: list[PurchaseOrderLineCreate] = Field(default_factory=list)


class PurchaseOrderUpdate(BaseModel):
    supplier_name: str | None = Field(default=None, min_length=1, max_length=255)
    supplier_id: int | None = None
    branch_id: int | None = None
    notes: str | None = Field(default=None, max_length=1024)
    expected_at: datetime | None = None
    lines: list[PurchaseOrderLineCreate] | None = None


class PurchaseOrderRead(PurchaseOrderBase):
    id: int
    supplier_id: int | None = None
    status: str
    sent_at: datetime | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
    lines: list[PurchaseOrderLineRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class PurchaseOrderSendRequest(BaseModel):
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)
