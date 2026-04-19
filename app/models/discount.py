"""Discount rule engine models (Epic 6.2).

Supports multiple discount strategies via DiscountType enum:
FLAT, PERCENTAGE, BOGO (buy-X-get-Y), and COMBO.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class DiscountType(PyEnum):
    FLAT = "flat"
    PERCENTAGE = "percentage"
    BOGO = "bogo"
    COMBO = "combo"


class DiscountStatus(PyEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    DISABLED = "disabled"


class DiscountRule(Base):
    """Discount rule with strategy-pattern type selection."""

    __tablename__ = "discount_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    discount_type: Mapped[DiscountType] = mapped_column(
        Enum(DiscountType, native_enum=False), nullable=False
    )
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    min_order_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    max_discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    target_product_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    buy_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    get_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[DiscountStatus] = mapped_column(
        Enum(DiscountStatus, native_enum=False), nullable=False, default=DiscountStatus.DRAFT
    )
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stackable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class DiscountUsageLog(Base):
    """Tracks each application of a discount rule."""

    __tablename__ = "discount_usage_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    discount_rule_id: Mapped[int] = mapped_column(
        ForeignKey("discount_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cart_id: Mapped[int | None] = mapped_column(
        ForeignKey("pos_carts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    applied_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
