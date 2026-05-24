"""Pydantic schemas for purchase orders (Epic 2)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PurchaseOrderLineBase(BaseModel):
    product_id: int
    variant_id: int | None = None
    qty: int = Field(gt=0)
    uom_id: int = Field(gt=0, description="Unit for qty on this line.")


class PurchaseOrderLineCreate(PurchaseOrderLineBase):
    unit_cost: Decimal | None = Field(
        default=None,
        description="Optional on PO; required at goods receipt.",
    )

    @field_validator("unit_cost")
    @classmethod
    def _unit_cost_positive_when_set(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("unit_cost must be positive when provided")
        return v


class PurchaseOrderLineRead(PurchaseOrderLineBase):
    id: int
    unit_cost: Decimal | None = None
    qty_base: int = Field(description="Quantity converted to the product base unit.")
    uom_name: str = Field(default="", description="Display name of line UoM.")
    uom_symbol: str = Field(default="", description="Symbol of line UoM.")

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
    branch_name: str | None = None
    status: str
    sent_at: datetime | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
    lines: list[PurchaseOrderLineRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class PurchaseOrderSendRequest(BaseModel):
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)
