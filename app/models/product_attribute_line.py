"""Product template attribute lines (Odoo product.template.attribute.line)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ProductAttributeLine(Base):
    """One variant axis configured on a product template."""

    __tablename__ = "product_attribute_lines"
    __table_args__ = (
        UniqueConstraint("product_id", "attribute_id", name="uq_product_attribute_lines_product_attr"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attribute_id: Mapped[int] = mapped_column(
        ForeignKey("attributes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    product = relationship("Product", back_populates="attribute_lines")
    attribute = relationship("CatalogAttribute")
    line_values = relationship(
        "ProductAttributeLineValue",
        back_populates="line",
        cascade="all, delete-orphan",
    )
