"""Request/response schemas for opening balance GL posting (Workstream F / Epic 19.3)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class OpeningBalanceLineIn(BaseModel):
    account_id: int
    branch_id: int | None = Field(
        default=None,
        description="Branch for this line; defaults to opening balance default branch",
    )
    debit: Decimal = Field(default=Decimal("0"), ge=0)
    credit: Decimal = Field(default=Decimal("0"), ge=0)
    memo: str | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def one_side_positive(self) -> OpeningBalanceLineIn:
        if (self.debit > 0 and self.credit > 0) or (self.debit == 0 and self.credit == 0):
            raise ValueError("Each line must have exactly one of debit or credit positive")
        return self


class OpeningBalanceCreate(BaseModel):
    entry_date: date
    description: str = Field(..., min_length=1, max_length=512)
    lines: list[OpeningBalanceLineIn] = Field(..., min_length=1)
    reference: str | None = Field(default=None, max_length=128)
    branch_id: int = Field(
        ...,
        description="Default branch_id for lines where branch_id is omitted",
    )


class OpeningBalancePostResult(BaseModel):
    status: str
    message: str
    journal_entry_id: int | None = None
    idempotency_key: str | None = None
    total_amount: str | None = None


class CapitalInjectionCreate(BaseModel):
    entry_date: date
    cash_amount: Decimal = Field(..., gt=0)
    equity_account_id: int
    branch_id: int
    description: str | None = Field(default=None, max_length=512)
    reference: str | None = Field(default=None, max_length=128)
    cash_account_id: int | None = None


class InitialInventoryCreate(BaseModel):
    entry_date: date
    inventory_amount: Decimal = Field(..., gt=0)
    source_account_id: int
    branch_id: int
    description: str | None = Field(default=None, max_length=512)
    reference: str | None = Field(default=None, max_length=128)
    inventory_account_id: int | None = None
