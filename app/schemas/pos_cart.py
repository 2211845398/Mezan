"""Pydantic schemas for POS cart APIs."""

from __future__ import annotations

from pydantic import BaseModel, Field


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
