"""Pydantic schemas for financial reports (Epic 5.5)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


class TrialBalanceRow(BaseModel):
    account_id: int
    code: str
    name: str
    account_type: str
    total_debit: float
    total_credit: float
    net: float


class IncomeStatementRead(BaseModel):
    period_start: str
    period_end: str
    total_revenue: float
    total_expense: float
    net_income: float


class BalanceSheetRead(BaseModel):
    as_of: str
    total_assets: float
    total_liabilities: float
    total_equity: float
    assets_minus_liabilities_equity: float


class ExecutiveKpiRead(BaseModel):
    invoice_count: int
    gross_sales: float
    period_start: str | None
    period_end: str | None
    branch_id: int | None


class FiscalPeriodRead(BaseModel):
    id: int
    period_key: str
    period_start: date
    period_end: date
    status: Literal["open", "closed"]
    closed_at: datetime | None = None
    closed_by_user_id: int | None = None

    model_config = {"from_attributes": True}


class FiscalPeriodStatusUpdate(BaseModel):
    status: Literal["open", "closed"]


class JournalReversalRequest(BaseModel):
    reversal_date: date | None = None
    reason: str | None = Field(default=None, max_length=255)


class JournalReversalResponse(BaseModel):
    journal_entry_id: int
    reverses_entry_id: int
    idempotency_key: str
    entry_date: date


class ArOpenItemCreate(BaseModel):
    branch_id: int
    customer_id: int | None = None
    source_type: str
    source_id: str
    description: str | None = None
    document_date: date
    due_date: date | None = None
    currency_code: str = "USD"
    amount_total: Decimal = Field(gt=0)


class ApOpenItemCreate(BaseModel):
    branch_id: int
    supplier_id: int | None = None
    source_type: str
    source_id: str
    description: str | None = None
    document_date: date
    due_date: date | None = None
    currency_code: str = "USD"
    amount_total: Decimal = Field(gt=0)


class OpenItemRead(BaseModel):
    id: int
    branch_id: int
    source_type: str
    source_id: str
    description: str | None = None
    document_date: date
    due_date: date | None = None
    currency_code: str
    amount_total: float
    amount_open: float
    status: str
    days_overdue: int | None = None
    customer_id: int | None = None
    supplier_id: int | None = None


class PaymentApplicationCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    reference: str | None = None
    note: str | None = None


class PaymentApplicationRead(BaseModel):
    id: int
    amount: Decimal
    reference: str | None = None
    note: str | None = None
    created_by_user_id: int | None = None
    applied_at: datetime

    model_config = {"from_attributes": True}
