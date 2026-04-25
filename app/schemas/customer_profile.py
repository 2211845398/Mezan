"""Pydantic schemas for POS / CRM customer profiles."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


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


class CustomerCreateStaff(BaseModel):
    phone: str = Field(min_length=3, max_length=64)
    full_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    is_temporary: bool = False
    default_currency_id: int | None = None
    receivables_account_id: int | None = None


class CustomerUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    is_temporary: bool | None = None
    default_currency_id: int | None = None
    receivables_account_id: int | None = None


class CustomerListItemRead(BaseModel):
    id: int
    phone: str
    full_name: str | None
    email: str | None
    is_temporary: bool
    loyalty_balance: int
    lifetime_spend: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class CustomerDetailRead(BaseModel):
    id: int
    phone: str
    full_name: str | None
    email: str | None
    is_temporary: bool
    default_currency_id: int | None = None
    receivables_account_id: int | None = None
    created_at: datetime
    updated_at: datetime
    loyalty_balance: int
    lifetime_spend: Decimal

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class CustomerListResponse(BaseModel):
    items: list[CustomerListItemRead]
    total: int
    limit: int
    offset: int


class CustomerSalesInvoiceListItem(BaseModel):
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


class CustomerSalesInvoiceListResponse(BaseModel):
    items: list[CustomerSalesInvoiceListItem]
    total: int
    limit: int
    offset: int
