"""Pydantic schemas for warehouse-to-store transfer batches (Epic 2)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TransferLineCreate(BaseModel):
    product_id: int
    qty: int = Field(gt=0)


class TransferLineRead(TransferLineCreate):
    id: int

    model_config = {"from_attributes": True}


class TransferBatchCreate(BaseModel):
    from_branch_id: int
    to_branch_id: int
    lines: list[TransferLineCreate] = Field(default_factory=list)


class TransferBatchRead(BaseModel):
    id: int
    from_branch_id: int
    to_branch_id: int
    status: str
    created_by_user_id: int | None
    dispatched_at: datetime | None
    received_at: datetime | None
    created_at: datetime
    updated_at: datetime
    lines: list[TransferLineRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}
