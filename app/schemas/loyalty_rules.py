"""Pydantic schemas for Loyalty Rules DSL (Epic 22.3)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class LoyaltyRuleRead(BaseModel):
    """A loyalty rule definition."""

    id: str
    name: str
    description: str
    trigger: str
    action_type: str
    action_value: int
    priority: int

    class Config:
        from_attributes = True


class LoyaltyRulesListResponse(BaseModel):
    """List of all loyalty rules."""

    rules: list[LoyaltyRuleRead] = []


class LoyaltyCalculationRequest(BaseModel):
    """Request to calculate loyalty for a purchase."""

    cart_total: Decimal = Field(..., gt=0)
    category_codes: list[str] = Field(default=[])
    is_weekend: bool = False


class MatchedRuleRead(BaseModel):
    """A rule that matched during evaluation."""

    rule_id: str
    rule_name: str
    action_type: str
    action_value: int
    priority: int


class LoyaltyCalculationRead(BaseModel):
    """Result of loyalty calculation."""

    matched_rules: list[MatchedRuleRead] = []
    calculation: dict
    base_points: int
    multiplier: int
    total_points: int


class LoyaltyPreviewResponse(BaseModel):
    """Preview loyalty accrual without recording."""

    customer_id: int | None = None
    cart_total: Decimal
    would_earn: int
    breakdown: dict
