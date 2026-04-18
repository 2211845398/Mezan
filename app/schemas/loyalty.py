"""Pydantic schemas for the Loyalty Points engine (Epic 6.1)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class LedgerEntryType(StrEnum):
    CREDIT = "credit"
    DEBIT = "debit"


class LedgerReasonCode(StrEnum):
    PURCHASE = "purchase"
    MANUAL_ADJUSTMENT = "manual_adjustment"
    REDEMPTION = "redemption"
    EXPIRY = "expiry"
    CORRECTION = "correction"


# ---------------------------------------------------------------------------
# Accrual Rule schemas
# ---------------------------------------------------------------------------


class AccrualRuleBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    points_per_unit: int = Field(default=1, ge=1)
    currency_per_point: Decimal = Field(default=Decimal("10.00"), gt=0)
    is_active: bool = True


class AccrualRuleCreate(AccrualRuleBase):
    pass


class AccrualRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    points_per_unit: int | None = Field(default=None, ge=1)
    currency_per_point: Decimal | None = Field(default=None, gt=0)
    is_active: bool | None = None


class AccrualRuleRead(AccrualRuleBase):
    id: int
    created_by_user_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})


# ---------------------------------------------------------------------------
# Ledger entry schemas
# ---------------------------------------------------------------------------


class LedgerEntryRead(BaseModel):
    id: int
    customer_id: int
    entry_type: LedgerEntryType
    points: int
    balance_after: int
    reason_code: LedgerReasonCode
    reference_id: str | None = None
    note: str | None = None
    auditor_id: int | None = None
    rule_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ManualPointAdjustment(BaseModel):
    """Payload for manual point credit/debit by an auditor."""

    customer_id: int
    points: int = Field(gt=0)
    entry_type: LedgerEntryType
    reason_code: LedgerReasonCode = LedgerReasonCode.MANUAL_ADJUSTMENT
    note: str | None = Field(default=None, max_length=512)


class LoyaltyBalanceRead(BaseModel):
    customer_id: int
    total_points: int
