"""Many-to-many link between products and catalog tax definitions."""

from __future__ import annotations

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ProductTaxDefinition(Base):
    """Assigns one or more output taxes to a product (parallel rates on same exclusive base)."""

    __tablename__ = "product_tax_definitions"

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tax_definition_id: Mapped[int] = mapped_column(
        ForeignKey("tax_definitions.id", ondelete="RESTRICT"),
        primary_key=True,
    )

    product = relationship("Product", back_populates="tax_definition_links")
    tax_definition = relationship("TaxDefinition", back_populates="product_links")
