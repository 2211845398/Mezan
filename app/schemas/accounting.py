"""Pydantic schemas for financial reports (Epic 5.5)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TrialBalanceRow(BaseModel):
    account_id: int
    code: str
    name: str
    account_type: str
    total_debit: Decimal
    total_credit: Decimal
    net: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class IncomeStatementRead(BaseModel):
    period_start: str
    period_end: str
    total_revenue: Decimal
    total_expense: Decimal
    net_income: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class BalanceSheetRead(BaseModel):
    as_of: str
    total_assets: Decimal
    total_liabilities: Decimal
    total_equity: Decimal
    assets_minus_liabilities_equity: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class ExecutiveKpiRead(BaseModel):
    invoice_count: int
    gross_sales: Decimal
    period_start: str | None
    period_end: str | None
    branch_id: int | None

    model_config = ConfigDict(json_encoders={Decimal: str})


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
    amount_total: Decimal
    amount_open: Decimal
    status: str
    days_overdue: int | None = None
    customer_id: int | None = None
    supplier_id: int | None = None

    model_config = ConfigDict(json_encoders={Decimal: str})


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

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


class GeneralLedgerLineRead(BaseModel):
    journal_entry_id: int
    entry_date: str
    description: str
    source_type: str | None = None
    source_id: str | None = None
    line_no: int
    debit: Decimal
    credit: Decimal
    branch_id: int
    memo: str | None = None

    model_config = ConfigDict(json_encoders={Decimal: str})
