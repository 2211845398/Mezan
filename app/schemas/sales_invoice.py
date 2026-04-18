"""Pydantic schemas for sales invoices (finalize / read)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


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
    total: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})
