"""Bill of Materials (BoM) and Production Orders (Epic 20.3)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class BillOfMaterials(Base):
    """BoM header: defines how to build a finished product from components."""

    __tablename__ = "bill_of_materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    finished_product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0")
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    lines = relationship("BomLine", back_populates="bom", cascade="all, delete-orphan")


class BomLine(Base):
    """BoM line: component product and quantity required."""

    __tablename__ = "bom_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bom_id: Mapped[int] = mapped_column(
        ForeignKey("bill_of_materials.id", ondelete="CASCADE"), nullable=False, index=True
    )
    component_product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    qty_required: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_cost_at_creation: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 4), nullable=True
    )  # Snapshot of component cost when BoM created
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    bom = relationship("BillOfMaterials", back_populates="lines")


class ProductionOrder(Base):
    """Work order to manufacture finished goods using a BoM."""

    __tablename__ = "production_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    bom_id: Mapped[int] = mapped_column(
        ForeignKey("bill_of_materials.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    qty_to_produce: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    qty_produced: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0")
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="draft"
    )  # draft, issued, in_progress, completed, cancelled
    planned_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    planned_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_cost_issued: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    overhead_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    finished_goods_value: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
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


class ProductionOrderIssue(Base):
    """Materials issued to a production order (WIP)."""

    __tablename__ = "production_order_issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    production_order_id: Mapped[int] = mapped_column(
        ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    qty_issued: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    issued_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class ProductionOrderReceipt(Base):
    """Finished goods received from production."""

    __tablename__ = "production_order_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    production_order_id: Mapped[int] = mapped_column(
        ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    qty_received: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False
    )  # Calculated from total WIP cost
    total_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    received_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
