"""Supplier master schemas (Epic 5 + W-5.4)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Self

from pydantic import BaseModel, Field, model_validator

from app.utils.contact_validation import validate_supplier_contact_dict


class SupplierCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    first_name: str | None = Field(default=None, max_length=255)
    father_name: str | None = Field(default=None, max_length=255)
    family_name: str | None = Field(default=None, max_length=255)
    currency_id: int
    payables_account_id: int | None = None
    tax_id: str | None = Field(default=None, max_length=64)
    contact: dict[str, Any] = Field(default_factory=dict)
    payment_terms: str | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def validate_create(self) -> Self:
        parts = [p.strip() for p in (self.first_name, self.father_name, self.family_name) if p]
        if not any(parts):
            raise ValueError("At least one of first_name, father_name, family_name is required")
        validate_supplier_contact_dict(self.contact)
        return self


class SupplierUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=255)
    father_name: str | None = Field(default=None, max_length=255)
    family_name: str | None = Field(default=None, max_length=255)
    currency_id: int | None = None
    payables_account_id: int | None = None
    tax_id: str | None = Field(default=None, max_length=64)
    contact: dict[str, Any] | None = None
    payment_terms: str | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def validate_update_contact(self) -> Self:
        validate_supplier_contact_dict(self.contact)
        return self


class SupplierRead(BaseModel):
    id: int
    code: str
    first_name: str | None
    father_name: str | None
    family_name: str | None
    currency_id: int
    payables_account_id: int | None
    tax_id: str | None
    contact: dict[str, Any]
    payment_terms: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
