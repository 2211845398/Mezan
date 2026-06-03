"""Product variant models for distinct SKU/color/size combinations (Epic 18)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ProductVariant(Base):
    """Distinct stock-keeping entity for a product (e.g., red Adidas shirt size M).

    Each variant has a unique SKU and optional barcode. All inventory movements,
    sales, purchases, and cost tracking reference the variant, not the product.
    """

    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("sku", name="uq_product_variants_sku"),
        UniqueConstraint(
            "barcode", name="uq_product_variants_barcode", deferrable="INITIALLY DEFERRED"
        ),
        UniqueConstraint("reference_code", name="uq_product_variants_reference_code"),
        UniqueConstraint(
            "product_id",
            "combination_key",
            name="uq_product_variants_product_combination",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sku: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    reference_code: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True, index=True
    )
    barcode: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True, index=True)
    combination_key: Mapped[str] = mapped_column(
        String(512), nullable=False, default="_default", index=True
    )
    price_extra: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0")
    )
    # Distinguishing attributes: {"color": "red", "size": "M"}
    attribute_values: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
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

    product = relationship("Product", back_populates="variants")
    variant_attributes = relationship(
        "ProductVariantAttribute",
        back_populates="variant",
        cascade="all, delete-orphan",
    )
