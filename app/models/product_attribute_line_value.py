"""Selected attribute values on a product template attribute line."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ProductAttributeLineValue(Base):
    """One value enabled for a product template axis."""

    __tablename__ = "product_attribute_line_values"
    __table_args__ = (
        UniqueConstraint(
            "line_id",
            "attribute_value_id",
            name="uq_product_attribute_line_values_line_value",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    line_id: Mapped[int] = mapped_column(
        ForeignKey("product_attribute_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attribute_value_id: Mapped[int] = mapped_column(
        ForeignKey("attribute_values.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    line = relationship("ProductAttributeLine", back_populates="line_values")
    attribute_value = relationship("CatalogAttributeValue")
