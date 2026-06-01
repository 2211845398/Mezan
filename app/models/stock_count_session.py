"""Stock count session and line models."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class StockCountSession(Base):
    __tablename__ = "stock_count_sessions"
    __table_args__ = (
        UniqueConstraint("branch_id", "version_no", name="uq_stock_count_sessions_branch_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    product_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    responsible_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lines: Mapped[list["StockCountLine"]] = relationship(
        "StockCountLine",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class StockCountLine(Base):
    __tablename__ = "stock_count_lines"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "product_id",
            "variant_id",
            name="uq_stock_count_lines_session_product_variant",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("stock_count_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    variant_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    reference_code: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    system_on_hand: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    system_reserved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    system_damaged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    counted_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    damaged_counted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(512), nullable=True)

    session: Mapped["StockCountSession"] = relationship("StockCountSession", back_populates="lines")
