"""Pydantic schemas for warehouse-to-store transfer batches (Epic 2)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TransferLineCreate(BaseModel):
    product_id: int
    qty: int = Field(gt=0)
    uom_id: int
    variant_id: int | None = None


class TransferLineRead(BaseModel):
    id: int
    product_id: int
    qty: int
    qty_base: int = 0
    uom_id: int
    uom_name: str = ""
    variant_id: int | None = None
    product_name: str = ""
    variant_sku: str = ""
    variant_name: str = ""
    reference_code: str = ""
    variant_attributes: str = ""

    model_config = {"from_attributes": True}


class TransferBatchCreate(BaseModel):
    from_branch_id: int
    to_branch_id: int
    lines: list[TransferLineCreate] = Field(default_factory=list)


class TransferBatchRead(BaseModel):
    id: int
    from_branch_id: int
    to_branch_id: int
    from_branch_name: str = ""
    to_branch_name: str = ""
    status: str
    created_by_user_id: int | None
    created_by_user_name: str | None = None
    dispatched_at: datetime | None
    received_at: datetime | None
    created_at: datetime
    updated_at: datetime
    lines: list[TransferLineRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}
