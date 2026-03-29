"""Schemas for Epic 3 POS APIs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PosShiftOpenRequest(BaseModel):
    terminal_id: int
    opening_float: float = Field(ge=0)


class PosShiftCashEventRequest(BaseModel):
    event_type: str
    amount: float
    note: str | None = None


class PosShiftCloseRequest(BaseModel):
    declared_cash: float = Field(ge=0)


class PosShiftRead(BaseModel):
    id: int
    terminal_id: int
    branch_id: int
    status: str
    opening_float: float
    expected_cash: float
    declared_cash: float | None
    variance: float | None
    opened_at: datetime
    closed_at: datetime | None

    model_config = {"from_attributes": True}


class StockAdjustmentRequest(BaseModel):
    branch_id: int
    product_id: int
    qty_delta: int
    reason: str = Field(min_length=2, max_length=64)
    idempotency_key: str = Field(min_length=8, max_length=128)


class CustomerCreateTemporaryRequest(BaseModel):
    phone: str


class CustomerCompleteOnboardingRequest(BaseModel):
    token: str
    full_name: str | None = None
    email: str | None = None


class CustomerRead(BaseModel):
    id: int
    phone: str
    full_name: str | None
    email: str | None
    is_temporary: bool

    model_config = {"from_attributes": True}


class CartCreateRequest(BaseModel):
    terminal_id: int
    shift_id: int | None = None
    customer_id: int | None = None


class CartLineUpsertRequest(BaseModel):
    product_id: int
    qty: int = Field(gt=0)


class CartDiscountRequest(BaseModel):
    code: str
    amount: float = Field(gt=0)


class CartStateRequest(BaseModel):
    action: str  # park,resume,lock,cancel


class CartRead(BaseModel):
    id: int
    terminal_id: int
    branch_id: int
    status: str
    subtotal: float
    discount_total: float
    total: float

    model_config = {"from_attributes": True}


class PaymentIntentCreateRequest(BaseModel):
    cart_id: int
    provider: str = "mock"
    currency: str = "USD"


class PaymentCaptureRequest(BaseModel):
    payment_intent_id: int
    idempotency_key: str = Field(min_length=8, max_length=128)
    method: str = "card"
    reference: str | None = None


class PaymentIntentRead(BaseModel):
    id: int
    cart_id: int
    provider: str
    amount: float
    currency: str
    status: str
    external_id: str | None

    model_config = {"from_attributes": True}


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


class SalesReturnLineRequest(BaseModel):
    sales_invoice_line_id: int
    qty: int = Field(gt=0)


class SalesReturnRequest(BaseModel):
    invoice_barcode: str
    reason: str | None = None
    lines: list[SalesReturnLineRequest]
    exchange_cart_id: int | None = None
