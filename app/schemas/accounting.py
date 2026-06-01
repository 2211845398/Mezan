"""Pydantic schemas for financial reports (Epic 5.5)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TrialBalanceRow(BaseModel):
    account_id: int
    code: str
    name: str
    account_type: str
    total_debit: Decimal
    total_credit: Decimal
    net: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class RevenueTrendPoint(BaseModel):
    """One calendar day of posted sales revenue."""

    bucket_date: date
    gross_sales: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class CategoryMixRow(BaseModel):
    """Revenue share by product category (from invoice lines)."""

    category_id: int
    category_name: str
    gross_sales: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class TopProductRow(BaseModel):
    """Top seller by line revenue in the filtered period."""

    product_id: int
    product_name: str
    qty_sold: int
    revenue: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class RecentPurchaseOrderRow(BaseModel):
    """Latest purchase orders for executive snapshot."""

    id: int
    supplier_name: str
    status: str
    branch_id: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExecutiveKpiRead(BaseModel):
    """Executive dashboard aggregates from operational sales + PO snapshot.

    ``gross_margin_ratio`` and ``estimated_cogs`` use product ``standard_cost``
    × sold qty as a COGS estimate (not FIFO/WAC at sale time).
    ``loyalty_points_accrued`` sums purchase-accrual credits in the date range;
    it is not branch-scoped (loyalty ledger has no branch_id).
    """

    invoice_count: int
    gross_sales: Decimal
    period_start: str | None
    period_end: str | None
    branch_id: int | None
    avg_ticket: Decimal = Decimal("0")
    estimated_cogs: Decimal = Decimal("0")
    gross_margin_ratio: Decimal | None = None
    loyalty_points_accrued: int = 0
    revenue_trend: list[RevenueTrendPoint] = Field(default_factory=list)
    category_mix: list[CategoryMixRow] = Field(default_factory=list)
    top_products: list[TopProductRow] = Field(default_factory=list)
    recent_purchase_orders: list[RecentPurchaseOrderRow] = Field(default_factory=list)

    model_config = ConfigDict(json_encoders={Decimal: str})


class FiscalPeriodRead(BaseModel):
    id: int
    period_key: str
    period_start: date
    period_end: date
    status: Literal["open", "soft_closed", "closed"]
    closed_at: datetime | None = None
    closed_by_user_id: int | None = None

    model_config = {"from_attributes": True}


class FiscalPeriodStatusUpdate(BaseModel):
    status: Literal["open", "soft_closed", "closed"]


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
    fx_rate: Decimal | None = Field(
        default=None,
        description="Functional rate at posting; defaults from currency master vs base",
    )
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
    fx_rate: Decimal | None = Field(
        default=None,
        description="Functional rate at posting; defaults from currency master vs base",
    )
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
    fx_rate: Decimal | None = None
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
    customer_id: int | None = None
    supplier_id: int | None = None
    employee_id: int | None = None
    partner_display_name: str | None = None
    running_balance: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class JournalEntryListItemRead(BaseModel):
    id: int
    entry_date: date
    description: str
    source_type: str
    source_id: str
    total_debit: Decimal
    total_credit: Decimal
    reverses_entry_id: int | None = None
    reversed_by_entry_id: int | None = None

    model_config = ConfigDict(json_encoders={Decimal: str})


class JournalEntryListResponse(BaseModel):
    items: list[JournalEntryListItemRead]
    total: int


class JournalEntryLineRead(BaseModel):
    line_no: int
    account_id: int
    code: str
    name: str
    account_type: str
    branch_id: int
    debit: Decimal
    credit: Decimal
    memo: str | None = None
    customer_id: int | None = None
    supplier_id: int | None = None
    employee_id: int | None = None
    subledger_kind: str | None = None

    model_config = ConfigDict(json_encoders={Decimal: str})


class JournalEntryDetailRead(BaseModel):
    id: int
    entry_date: date
    description: str
    source_type: str
    source_id: str
    reverses_entry_id: int | None = None
    reversed_by_entry_id: int | None = None
    lines: list[JournalEntryLineRead]

    model_config = ConfigDict(json_encoders={Decimal: str})


class ChartAccountRead(BaseModel):
    id: int
    code: str
    name: str
    account_type: str
    parent_id: int | None = None
    is_control: bool
    is_system: bool
    active: bool

    model_config = {"from_attributes": True}

    @field_validator("account_type", mode="before")
    @classmethod
    def _account_type_to_str(cls, v: object) -> str:
        if v is not None and hasattr(v, "value"):
            return str(v.value)
        return str(v)


class ManualJournalLineIn(BaseModel):
    account_id: int
    branch_id: int
    debit: Decimal = Field(default=Decimal("0"))
    credit: Decimal = Field(default=Decimal("0"))
    memo: str | None = Field(default=None, max_length=512)
    customer_id: int | None = None
    supplier_id: int | None = None
    employee_id: int | None = None


class ManualJournalCreate(BaseModel):
    entry_date: date
    description: str = Field(max_length=512)
    lines: list[ManualJournalLineIn] = Field(min_length=2)
    idempotency_key: str | None = None


class ManualJournalUpdate(BaseModel):
    entry_date: date
    description: str = Field(max_length=512)
    lines: list[ManualJournalLineIn] = Field(min_length=2)


class StatementAccountLineRead(BaseModel):
    account_id: int
    code: str
    name: str
    account_type: str
    amount: Decimal

    model_config = ConfigDict(json_encoders={Decimal: str})


class IncomeStatementRead(BaseModel):
    period_start: str
    period_end: str
    total_revenue: Decimal
    total_expense: Decimal
    net_income: Decimal
    revenue_lines: list[StatementAccountLineRead] = Field(default_factory=list)
    expense_lines: list[StatementAccountLineRead] = Field(default_factory=list)

    model_config = ConfigDict(json_encoders={Decimal: str})


class BalanceSheetRead(BaseModel):
    as_of: str
    total_assets: Decimal
    total_liabilities: Decimal
    total_equity: Decimal
    assets_minus_liabilities_equity: Decimal
    asset_lines: list[StatementAccountLineRead] = Field(default_factory=list)
    liability_lines: list[StatementAccountLineRead] = Field(default_factory=list)
    equity_lines: list[StatementAccountLineRead] = Field(default_factory=list)

    model_config = ConfigDict(json_encoders={Decimal: str})


class BranchFinancialSnapshotRead(BaseModel):
    """Epic 19.7: branch-scoped TB roll-up plus optional P&L + balance sheet window."""

    branch_id: int
    as_of: str
    trial_balance_accounts: int
    rolled_debit: Decimal
    rolled_credit: Decimal
    rolled_net: Decimal
    period_start: str | None = None
    period_end: str | None = None
    net_income: Decimal | None = None
    total_revenue: Decimal | None = None
    total_expense: Decimal | None = None
    total_assets: Decimal | None = None
    total_liabilities: Decimal | None = None
    total_equity: Decimal | None = None
    assets_minus_liabilities_equity: Decimal | None = None

    model_config = ConfigDict(json_encoders={Decimal: str})
