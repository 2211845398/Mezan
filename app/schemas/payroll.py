"""Pydantic schemas for payroll workflows (Epic 4.3/4.4)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PayslipGenerateRequest(BaseModel):
    employee_profile_id: int
    period_start: date
    period_end: date
    deductions: Decimal = Field(default=Decimal("0.00"), ge=0)
    hourly_rate_override: Decimal | None = Field(default=None, ge=0)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class PayslipApproveRequest(BaseModel):
    payslip_id: int
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class PayslipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_profile_id: int
    period_start: date
    period_end: date
    hours_worked: Decimal
    hourly_rate: Decimal
    deductions: Decimal
    gross_amount: Decimal
    net_amount: Decimal
    status: Literal["draft", "approved"]
    immutable_hash: str
    approved_by_user_id: int | None = None
    approved_at: datetime | None = None
    generate_idempotency_key: str | None = None
    approve_idempotency_key: str | None = None
    created_at: datetime
