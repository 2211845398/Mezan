"""Schemas for deterministic-facts AI advisory suggestions."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class MarketingAdvisoryRequest(BaseModel):
    branch_id: int | None = None
    lookback_days: int = Field(
        default=30,
        ge=1,
        le=366,
        description="Sales analysis window (calendar days ending today, UTC).",
    )
    days_ahead: int = Field(
        default=30,
        ge=1,
        le=180,
        description="Inventory expiry alert horizon in days.",
    )
    top_products_limit: int = Field(default=10, ge=1, le=50)
    max_suggestions: int = Field(default=5, ge=1, le=20)


class MarketingSuggestion(BaseModel):
    title: str
    rationale: str
    action_items: list[str]
    priority: str
    confidence: float


class MarketingAdvisoryResponse(BaseModel):
    model: str
    generated_at: datetime
    facts_used: dict
    suggestions: list[MarketingSuggestion]
