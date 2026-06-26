"""Supplier AP statement and evaluation schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SupplierStatementLineRead(BaseModel):
    entry_date: date
    reference: str
    description: str
    debit: Decimal
    credit: Decimal
    running_balance: Decimal
    source_type: str | None = None
    source_id: str | None = None
    journal_entry_id: int | None = None
    purchase_order_id: int | None = None
    open_item_id: int | None = None
    amount_total: Decimal | None = None
    amount_paid: Decimal | None = None
    amount_open: Decimal | None = None

    model_config = ConfigDict(json_encoders={Decimal: str})


class SupplierStatementRead(BaseModel):
    supplier_id: int
    date_from: date
    date_to: date
    opening_balance: Decimal
    closing_balance: Decimal
    total_purchases: Decimal
    total_paid: Decimal
    balance_due: Decimal
    currency_code: str = "USD"
    lines: list[SupplierStatementLineRead] = Field(default_factory=list)

    model_config = ConfigDict(json_encoders={Decimal: str})


class SupplierEvaluationRead(BaseModel):
    supplier_id: int
    period_days: int
    total_purchases: Decimal
    total_paid: Decimal
    open_balance: Decimal
    payment_count: int
    receipt_count: int
    avg_days_to_pay: float | None = None
    last_activity_date: date | None = None

    model_config = ConfigDict(json_encoders={Decimal: str})
