"""SQLAlchemy ORM model for transfer batch lines (Epic 2)."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class TransferLine(Base):
    __tablename__ = "transfer_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    transfer_batch_id: Mapped[int] = mapped_column(
        ForeignKey("transfer_batches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False)

    transfer_batch = relationship("TransferBatch", back_populates="lines")
    product = relationship("Product")
