"""Named price lists: effective date range, branch scope, per-product overrides (W-5.3)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class PriceList(Base):
    """Manual list for branch-scoped sell-price overrides; independent of POS resolution v1."""

    __tablename__ = "price_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    branches = relationship(
        "PriceListBranch", back_populates="price_list", cascade="all, delete-orphan"
    )
    lines = relationship("PriceListLine", back_populates="price_list", cascade="all, delete-orphan")


class PriceListBranch(Base):
    __tablename__ = "price_list_branches"
    __table_args__ = (
        PrimaryKeyConstraint("price_list_id", "branch_id", name="pk_price_list_branches"),
    )

    price_list_id: Mapped[int] = mapped_column(
        ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True
    )

    price_list = relationship("PriceList", back_populates="branches")


class PriceListLine(Base):
    __tablename__ = "price_list_lines"
    __table_args__ = (
        UniqueConstraint("price_list_id", "product_id", name="uq_price_list_lines_list_product"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    price_list_id: Mapped[int] = mapped_column(
        ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency_id: Mapped[int | None] = mapped_column(
        ForeignKey("currencies.id", ondelete="SET NULL"), nullable=True, index=True
    )

    price_list = relationship("PriceList", back_populates="lines")
