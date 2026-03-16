"""Pydantic schemas for invoice scan OCR/QR pipeline (Epic 2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class InvoiceScanCreate(BaseModel):
    source_type: str = Field(pattern="^(qr|image)$")
    data: str = Field(min_length=1)


class InvoiceScanRead(BaseModel):
    id: int
    source_type: str
    provider: str
    status: str
    raw_input_ref: dict[str, Any]
    raw_output: dict[str, Any] | None
    parsed_output: dict[str, Any] | None
    override_output: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InvoiceScanOverride(BaseModel):
    override_output: dict[str, Any]


class InvoiceScanValidateRequest(BaseModel):
    branch_id: int


class InvoiceScanValidateResponse(BaseModel):
    scan: InvoiceScanRead
    goods_receipt_id: int

