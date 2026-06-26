"""Pydantic schemas for POS proforma invoice (quote document)."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ProformaLineIn(BaseModel):
    product_id: int = Field(..., gt=0)
    variant_id: int | None = Field(default=None, gt=0)
    qty: int = Field(..., gt=0)


class ProformaQuoteRequest(BaseModel):
    lines: list[ProformaLineIn] = Field(default_factory=list, min_length=1)


class ProformaLineRead(BaseModel):
    product_id: int
    product_name: str
    product_sku: str
    variant_id: int | None = None
    variant_label: str | None = None
    qty: int
    unit_price: Decimal
    line_total: Decimal
    tax_rate: Decimal
    line_tax_amount: Decimal


class ProformaQuoteResponse(BaseModel):
    lines: list[ProformaLineRead]
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    currency_code: str


class ProformaExportRequest(BaseModel):
    lines: list[ProformaLineIn] = Field(default_factory=list, min_length=1)
    branch_id: int | None = None
    locale: Literal["ar", "en"] = "ar"

    @model_validator(mode="after")
    def _validate_lines(self) -> ProformaExportRequest:
        if not self.lines:
            raise ValueError("At least one line is required")
        return self
