"""Pydantic schemas for POS shift APIs."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PosShiftOpenRequest(BaseModel):
    terminal_id: int
    opening_float: Decimal = Field(ge=0)


class PosShiftCashEventRequest(BaseModel):
    event_type: str
    amount: Decimal
    note: str | None = None


class PosShiftCloseRequest(BaseModel):
    declared_cash: Decimal = Field(ge=0)


class PosShiftRead(BaseModel):
    id: int
    terminal_id: int
    branch_id: int
    status: str
    opening_float: Decimal
    expected_cash: Decimal
    declared_cash: Decimal | None
    variance: Decimal | None
    opened_at: datetime
    closed_at: datetime | None
    # Completed, non-voided sales invoices tied to carts on this shift (POS register counter).
    transactions_in_shift: int = 0

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})
