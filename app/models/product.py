"""SQLAlchemy ORM model for products in the master catalog."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Product(Base):
    """Master product record. Variant axes live in relational attribute tables."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    uom_id: Mapped[int] = mapped_column(
        ForeignKey("units_of_measure.id", ondelete="RESTRICT"),
        nullable=False,
        default=1,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    sku: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    barcode: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True, index=True)
    status: Mapped[str] = mapped_column(
        String(32), default="active", nullable=False
    )  # active, archived
    standard_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    output_vat_rate: Mapped[Decimal] = mapped_column(
        Numeric(8, 4),
        nullable=False,
        default=Decimal("0"),
    )  # Decimal fraction, e.g. 0.15 for 15% (tax-exclusive line amounts)
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

    category = relationship("Category", back_populates="products")
    unit_of_measure = relationship("UnitOfMeasure", back_populates="products")
    category_links = relationship(
        "ProductCategory",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    tax_definition_links = relationship(
        "ProductTaxDefinition",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    variants = relationship(
        "ProductVariant",
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )
    attribute_lines = relationship(
        "ProductAttributeLine",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    unit_conversions = relationship(
        "ProductUnitConversion",
        back_populates="product",
        cascade="all, delete-orphan",
    )
