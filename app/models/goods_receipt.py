"""SQLAlchemy ORM model for goods receipts from validated invoices (Epic 2)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    supplier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    invoice_number: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    source_invoice_scan_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoice_scans.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    lines = relationship(
        "GoodsReceiptLine", back_populates="goods_receipt", cascade="all, delete-orphan"
    )
