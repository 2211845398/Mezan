"""Pydantic schemas for POS / CRM customer profiles."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.contact_validation import parse_optional_email
from app.utils.libyan_phone import require_libyan_mobile


class CustomerCreateTemporaryRequest(BaseModel):
    phone: str

    @field_validator("phone", mode="before")
    @classmethod
    def strip_phone(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("phone")
    @classmethod
    def libyan_mobile(cls, v: str) -> str:
        return require_libyan_mobile(v)


class CustomerCompleteOnboardingRequest(BaseModel):
    token: str
    first_name: str | None = None
    father_name: str | None = None
    family_name: str | None = None
    email: str | None = None

    @field_validator("email", mode="before")
    @classmethod
    def blank_email_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str | None) -> str | None:
        return parse_optional_email(v)


class CustomerRead(BaseModel):
    id: int
    phone: str
    first_name: str | None
    father_name: str | None
    family_name: str | None
    email: str | None
    is_temporary: bool
    is_active: bool

    model_config = {"from_attributes": True}


class CustomerCreateStaff(BaseModel):
    phone: str = Field(max_length=64)
    first_name: str | None = Field(default=None, max_length=255)
    father_name: str | None = Field(default=None, max_length=255)
    family_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    is_temporary: bool = False
    default_currency_id: int | None = None
    receivables_account_id: int | None = None

    @field_validator("phone", mode="before")
    @classmethod
    def strip_phone(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("phone")
    @classmethod
    def libyan_mobile(cls, v: str) -> str:
        return require_libyan_mobile(v)

    @field_validator("email", mode="before")
    @classmethod
    def blank_email_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str | None) -> str | None:
        return parse_optional_email(v)


class CustomerUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=255)
    father_name: str | None = Field(default=None, max_length=255)
    family_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    is_temporary: bool | None = None
    is_active: bool | None = None
    default_currency_id: int | None = None
    receivables_account_id: int | None = None

    @field_validator("email", mode="before")
    @classmethod
    def blank_email_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str | None) -> str | None:
        return parse_optional_email(v)


class CustomerListItemRead(BaseModel):
    id: int
    phone: str
    first_name: str | None
    father_name: str | None
    family_name: str | None
    email: str | None
    is_temporary: bool
    is_active: bool
    loyalty_balance: int
    lifetime_spend: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class CustomerDetailRead(BaseModel):
    id: int
    phone: str
    first_name: str | None
    father_name: str | None
    family_name: str | None
    email: str | None
    is_temporary: bool
    is_active: bool
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
