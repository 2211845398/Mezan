"""Pydantic schemas for sales invoices (finalize / read)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    created_at: datetime
    voided_at: datetime | None = None
    void_reason: str | None = None

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class SalesInvoiceLineRead(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_sku: str
    barcode: str | None = None
    qty: int
    unit_price: Decimal
    line_total: Decimal
    tax_rate: Decimal
    line_tax_amount: Decimal

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class SalesInvoicePaymentRead(BaseModel):
    method: str
    amount: Decimal
    reference: str | None = None
    currency: str | None = None

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class SalesInvoiceDetailRead(BaseModel):
    id: int
    invoice_number: str
    invoice_barcode: str
    cart_id: int
    terminal_id: int
    branch_id: int
    customer_id: int | None = None
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    created_at: datetime
    voided_at: datetime | None = None
    void_reason: str | None = None
    lines: list[SalesInvoiceLineRead] = Field(default_factory=list)
    payments: list[SalesInvoicePaymentRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class SalesInvoiceListItem(BaseModel):
    id: int
    invoice_number: str
    invoice_barcode: str
    cart_id: int
    terminal_id: int
    branch_id: int
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class VoidInvoiceRequest(BaseModel):
    invoice_id: int | None = None
    invoice_barcode: str | None = None
    reason: str | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def _one_identifier(self) -> VoidInvoiceRequest:
        if (self.invoice_id is None) == (self.invoice_barcode is None):
            raise ValueError("Provide exactly one of invoice_id or invoice_barcode")
        return self
