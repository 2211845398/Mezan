"""Pivot: variant ↔ attribute value (source of truth for variant axes)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ProductVariantAttribute(Base):
    """Links a product variant to one value per attribute axis."""

    __tablename__ = "product_variant_attributes"
    __table_args__ = (
        UniqueConstraint("variant_id", "attribute_id", name="uq_pva_variant_attribute"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attribute_id: Mapped[int] = mapped_column(
        ForeignKey("attributes.id", ondelete="RESTRICT"),
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

    variant = relationship("ProductVariant", back_populates="variant_attributes")
    attribute = relationship("CatalogAttribute")
    attribute_value = relationship("CatalogAttributeValue")
