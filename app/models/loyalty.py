"""Loyalty points engine models (Epic 6.1).

LoyaltyLedger is append-only: balances are derived from the ledger,
never stored as a mutable column.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class LedgerEntryType(PyEnum):
    CREDIT = "credit"
    DEBIT = "debit"


class LedgerReasonCode(PyEnum):
    PURCHASE = "purchase"
    MANUAL_ADJUSTMENT = "manual_adjustment"
    REDEMPTION = "redemption"
    EXPIRY = "expiry"
    CORRECTION = "correction"


class LoyaltyAccrualRule(Base):
    """Configures how loyalty points are earned (e.g. 1 point per 10 currency)."""

    __tablename__ = "loyalty_accrual_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    points_per_unit: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    currency_per_point: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("10.00")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class LoyaltyLedger(Base):
    """Append-only ledger for loyalty point transactions.

    Never UPDATE a row; only INSERT new entries with computed balance_after.
    """

    __tablename__ = "loyalty_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customer_profiles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    entry_type: Mapped[LedgerEntryType] = mapped_column(
        Enum(LedgerEntryType, native_enum=False), nullable=False
    )
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reason_code: Mapped[LedgerReasonCode] = mapped_column(
        Enum(LedgerReasonCode, native_enum=False), nullable=False
    )
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    auditor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("loyalty_accrual_rules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
