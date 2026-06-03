"""Per-branch weighted-average inventory unit cost (Epic 5.4)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class BranchProductCost(Base):
    """Rolling weighted-average cost for COGS; updated on goods receipt."""

    __tablename__ = "branch_product_costs"
    __table_args__ = (
        UniqueConstraint(
            "branch_id",
            "product_id",
            "variant_id",
            name="uq_branch_product_costs_branch_product_variant",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    average_unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
