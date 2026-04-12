"""Pydantic schemas for the AI-ready auto-discount endpoint (Epic 6)."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.discount import DiscountRuleRead, DiscountType


class AIAutoDiscountRequest(BaseModel):
    """Strictly validated payload for AI-suggested discount creation.

    Creates a Draft DiscountRule for Sales Manager approval.
    """

    target_product_ids: list[int] = Field(min_length=1)
    suggested_discount_type: DiscountType
    percentage: float = Field(gt=0, le=100)
    expiration_date: datetime

    @field_validator("expiration_date")
    @classmethod
    def _must_be_future(cls, v: datetime) -> datetime:
        now = datetime.now(UTC)
        compare = v if v.tzinfo else v.replace(tzinfo=UTC)
        if compare <= now:
            raise ValueError("expiration_date must be in the future")
        return v


class AIAutoDiscountResponse(BaseModel):
    discount_rule: DiscountRuleRead
    message: str = "Draft discount rule created for approval"
