"""Pydantic schemas for POS cart APIs."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CartCreateRequest(BaseModel):
    terminal_id: int
    shift_id: int | None = None
    customer_id: int | None = None


class CartLineUpsertRequest(BaseModel):
    product_id: int
    variant_id: int | None = None
    qty: int = Field(ge=0)  # 0 removes the line for this product+variant (Epic 21.8)


class CartDiscountRequest(BaseModel):
    code: str
    amount: Decimal = Field(gt=0)


class CartStateRequest(BaseModel):
    action: str  # park,resume,lock,cancel


class CartLineRead(BaseModel):
    id: int
    product_id: int
    variant_id: int
    product_name: str
    product_sku: str
    barcode: str | None = None
    qty: int
    unit_price: Decimal
    line_total: Decimal
    tax_rate: Decimal
    line_tax_amount: Decimal

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class CartDiscountRead(BaseModel):
    id: int
    code: str
    amount: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class CartRead(BaseModel):
    id: int
    terminal_id: int
    branch_id: int
    daily_cart_number: int | None = None
    shift_id: int | None = None
    customer_id: int | None = None
    status: str
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    lines: list[CartLineRead] = Field(default_factory=list)
    discounts: list[CartDiscountRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})
