"""Pydantic schemas for voucher operations (Epic 19.4)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class VoucherAccountSpecIn(BaseModel):
    """Account specification for voucher line."""
    model_config = ConfigDict(populate_by_name=True)

    account_type: Literal["customer", "supplier", "cash", "bank", "expense", "ar", "ap", "custom"] = Field(
        description="Type of account to resolve"
    )
    entity_id: int | None = Field(
        None, description="Customer or Supplier ID (required for customer/supplier types)"
    )
    custom_account_id: int | None = Field(
        None, description="Explicit Chart of Accounts ID (required for custom/expense types)"
    )


class VoucherLineIn(BaseModel):
    """Single line in a voucher request."""
    model_config = ConfigDict(populate_by_name=True)

    spec: VoucherAccountSpecIn
    amount: Decimal = Field(gt=0, description="Line amount (positive)")
    memo: str = Field(default="", max_length=512)


class VoucherCreate(BaseModel):
    """Generic voucher creation request."""
    model_config = ConfigDict(populate_by_name=True)

    voucher_type: Literal["receipt", "payment", "expense", "transfer", "journal"]
    debit: VoucherLineIn
    credit: VoucherLineIn
    entry_date: date
    description: str = Field(min_length=1, max_length=512)
    reference: str | None = Field(None, max_length=128)
    branch_id: int
    idempotency_key: str | None = Field(None, max_length=256)

    # Optional multi-currency support (future)
    currency_code: str | None = Field(None, max_length=3)
    fx_rate: Decimal | None = Field(None, gt=0)


class ReceiptVoucherCreate(BaseModel):
    """Simplified receipt voucher: Dr Cash, Cr Customer AR."""
    model_config = ConfigDict(populate_by_name=True)

    customer_id: int | None = Field(None, description="Customer to clear AR for")
    cash_account_id: int | None = Field(None, description="Specific cash/bank account (or default)")
    amount: Decimal = Field(gt=0)
    entry_date: date
    description: str = Field(min_length=1, max_length=512)
    reference: str | None = Field(None, max_length=128)
    branch_id: int
    memo: str = Field(default="", max_length=512)
    idempotency_key: str | None = Field(None, max_length=256)


class PaymentVoucherCreate(BaseModel):
    """Simplified payment voucher: Dr Supplier AP, Cr Cash."""
    model_config = ConfigDict(populate_by_name=True)

    supplier_id: int | None = Field(None, description="Supplier to clear AP for")
    cash_account_id: int | None = Field(None, description="Specific cash/bank account (or default)")
    amount: Decimal = Field(gt=0)
    entry_date: date
    description: str = Field(min_length=1, max_length=512)
    reference: str | None = Field(None, max_length=128)
    branch_id: int
    memo: str = Field(default="", max_length=512)
    idempotency_key: str | None = Field(None, max_length=256)


class ExpenseVoucherCreate(BaseModel):
    """Simplified expense voucher: Dr Expense, Cr Cash."""
    model_config = ConfigDict(populate_by_name=True)

    expense_account_id: int = Field(description="Chart of Accounts expense account to debit")
    cash_account_id: int | None = Field(None, description="Specific cash/bank account (or default)")
    amount: Decimal = Field(gt=0)
    entry_date: date
    description: str = Field(min_length=1, max_length=512)
    reference: str | None = Field(None, max_length=128)
    branch_id: int
    memo: str = Field(default="", max_length=512)
    idempotency_key: str | None = Field(None, max_length=256)


class InternalTransferCreate(BaseModel):
    """Internal cash/bank transfer: Dr To, Cr From."""
    model_config = ConfigDict(populate_by_name=True)

    from_cash_account_id: int = Field(description="Source cash/bank account")
    to_cash_account_id: int = Field(description="Destination cash/bank account")
    amount: Decimal = Field(gt=0)
    entry_date: date
    description: str = Field(min_length=1, max_length=512)
    reference: str | None = Field(None, max_length=128)
    branch_id: int
    memo: str = Field(default="", max_length=512)
    idempotency_key: str | None = Field(None, max_length=256)


class VoucherRead(BaseModel):
    """Voucher posting result."""
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["posted", "duplicate"]
    journal_entry_id: int | None
    idempotency_key: str
    message: str
    debit_account_id: int | None = None
    credit_account_id: int | None = None
    amount: str | None = None
