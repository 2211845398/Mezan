"""Pydantic schemas for financial reports (Epic 5.5)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


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
