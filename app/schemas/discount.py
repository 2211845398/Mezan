"""Pydantic schemas for the Discount Rule engine (Epic 6.2)."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class DiscountType(StrEnum):
    FLAT = "flat"
    PERCENTAGE = "percentage"
    BOGO = "bogo"
    COMBO = "combo"


class DiscountStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    DISABLED = "disabled"


# ---------------------------------------------------------------------------
# DiscountRule schemas
# ---------------------------------------------------------------------------


class DiscountRuleBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=64)
    discount_type: DiscountType
    value: float = Field(gt=0)
    min_order_amount: float | None = Field(default=None, ge=0)
    max_discount_amount: float | None = Field(default=None, gt=0)
    target_product_ids: list[int] | None = None
    buy_qty: int | None = Field(default=None, ge=1)
    get_qty: int | None = Field(default=None, ge=1)
    start_date: datetime
    end_date: datetime | None = None
    usage_limit: int | None = Field(default=None, ge=1)
    stackable: bool = False

    @model_validator(mode="after")
    def _validate_discount_rules(self) -> DiscountRuleBase:
        if self.discount_type == DiscountType.PERCENTAGE and self.value > 100:
            raise ValueError("Percentage discount value cannot exceed 100")

        if self.end_date is not None and self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")

        if self.discount_type == DiscountType.BOGO:
            if self.buy_qty is None or self.get_qty is None:
                raise ValueError("BOGO discounts require both buy_qty and get_qty")

        return self


class DiscountRuleCreate(DiscountRuleBase):
    status: DiscountStatus = DiscountStatus.DRAFT


class DiscountRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=64)
    discount_type: DiscountType | None = None
    value: float | None = Field(default=None, gt=0)
    min_order_amount: float | None = None
    max_discount_amount: float | None = None
    target_product_ids: list[int] | None = None
    buy_qty: int | None = None
    get_qty: int | None = None
    status: DiscountStatus | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    usage_limit: int | None = None
    stackable: bool | None = None


class DiscountRuleRead(BaseModel):
    id: int
    name: str
    code: str
    discount_type: DiscountType
    value: float
    min_order_amount: float | None = None
    max_discount_amount: float | None = None
    target_product_ids: list[int] | None = None
    buy_qty: int | None = None
    get_qty: int | None = None
    status: DiscountStatus
    start_date: datetime
    end_date: datetime | None = None
    usage_limit: int | None = None
    usage_count: int
    stackable: bool
    created_by_user_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# DiscountUsageLog schemas
# ---------------------------------------------------------------------------


class DiscountUsageLogRead(BaseModel):
    id: int
    discount_rule_id: int
    cart_id: int | None = None
    customer_id: int | None = None
    discount_amount: float
    applied_by_user_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
