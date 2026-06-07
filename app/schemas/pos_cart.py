"""Pydantic schemas for POS cart APIs."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.pagination import PaginatedListResponse


class CartCreateRequest(BaseModel):
    terminal_id: int
    shift_id: int | None = None
    customer_id: int | None = None


class CartLineUpsertRequest(BaseModel):
    product_id: int
    variant_id: int | None = None
    uom_id: int | None = None
    qty: int = Field(ge=0)  # 0 removes the line for this product+variant (Epic 21.8)


class CartLineUomOptionRead(BaseModel):
    uom_id: int
    code: str
    symbol: str
    name: str
    factor_to_base: str
    is_base: bool


class VariantAttributeTagRead(BaseModel):
    attribute_name: str
    value_label: str


class CartDiscountRequest(BaseModel):
    mode: Literal["code", "loyalty", "flat"] = Field(default="code")
    code: str | None = Field(default=None, max_length=64)
    loyalty_points: int | None = Field(default=None, ge=1)
    amount: Decimal | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _validate_mode(self) -> CartDiscountRequest:
        if self.mode == "loyalty":
            if self.loyalty_points is None:
                raise ValueError("loyalty_points is required when mode is loyalty")
        elif self.mode == "flat":
            if self.amount is None:
                raise ValueError("amount is required when mode is flat")
        else:
            if not self.code or not str(self.code).strip():
                raise ValueError("code is required when mode is code")
        return self


class CartCustomerPatch(BaseModel):
    customer_id: int | None = None


class CartStateRequest(BaseModel):
    action: str  # park,resume,lock,cancel


class CartLineRead(BaseModel):
    id: int
    product_id: int
    variant_id: int
    product_name: str
    product_sku: str
    barcode: str | None = None
    product_image_url: str | None = None
    variant_label: str | None = None
    variant_attribute_tags: list[VariantAttributeTagRead] = Field(default_factory=list)
    uom_id: int
    uom_symbol: str = "pcs"
    uom_code: str = "PIECE"
    available_uoms: list[CartLineUomOptionRead] = Field(default_factory=list)
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
    loyalty_points_redeemed: int | None = None
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


class CartListResponse(PaginatedListResponse[CartRead]):
    """Paginated POS cart list."""
