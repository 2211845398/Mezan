"""Pydantic schemas for sales invoices (finalize / read)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FinalizeInvoiceRequest(BaseModel):
    cart_id: int
    payment_intent_id: int
    idempotency_key: str = Field(min_length=8, max_length=128)


class SalesInvoiceRead(BaseModel):
    id: int
    invoice_number: str
    invoice_barcode: str
    cart_id: int
    branch_id: int
    total: float
    created_at: datetime

    model_config = {"from_attributes": True}
