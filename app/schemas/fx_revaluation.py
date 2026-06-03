"""Pydantic schemas for FX Revaluation (Epic 20.2)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class FxRevaluationRunRequest(BaseModel):
    revaluation_date: date
    branch_id: int | None = Field(None, description="Branch to revalue (null for all)")


class FxRevaluationRunResponse(BaseModel):
    revaluation_date: date
    branch_id: int | None = None
    entries_created: int
    message: str


class FxRevaluationEntryRead(BaseModel):
    id: int
    entry_date: date
    description: str
    source_type: str
    source_id: str
    lines: list[dict] = []

    class Config:
        from_attributes = True


class FxBalanceRead(BaseModel):
    currency_code: str
    current_rate: Decimal
    open_ar_count: int
    open_ap_count: int
    estimated_gain_loss: Decimal


class FxRevaluationSummaryRequest(BaseModel):
    as_of_date: date = Field(default_factory=date.today)
    branch_id: int | None = None


class FxRevaluationSummaryResponse(BaseModel):
    as_of_date: date
    branch_id: int | None = None
    currencies: list[FxBalanceRead] = []
    total_estimated_gain_loss: Decimal
