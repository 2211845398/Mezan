"""Pydantic schemas for POS shift APIs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PosShiftOpenRequest(BaseModel):
    terminal_id: int
    opening_float: float = Field(ge=0)


class PosShiftCashEventRequest(BaseModel):
    event_type: str
    amount: float
    note: str | None = None


class PosShiftCloseRequest(BaseModel):
    declared_cash: float = Field(ge=0)


class PosShiftRead(BaseModel):
    id: int
    terminal_id: int
    branch_id: int
    status: str
    opening_float: float
    expected_cash: float
    declared_cash: float | None
    variance: float | None
    opened_at: datetime
    closed_at: datetime | None

    model_config = {"from_attributes": True}
