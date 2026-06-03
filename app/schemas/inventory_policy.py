"""Schemas for inventory policy CRUD."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class InventoryPolicyRead(BaseModel):
    id: int
    branch_id: int
    product_id: int
    reorder_point: int
    reorder_qty: int
    preferred_supplier_id: int | None
    lead_time_days: int | None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class InventoryPolicyUpsert(BaseModel):
    reorder_point: int = Field(ge=0)
    reorder_qty: int = Field(ge=0)
    preferred_supplier_id: int | None = None
    lead_time_days: int | None = Field(default=None, ge=0)
    is_active: bool = True
