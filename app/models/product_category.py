"""Many-to-many link between products and category tags (non-primary)."""

from __future__ import annotations

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ProductCategory(Base):
    """Extra category associations for a product (primary remains ``products.category_id``)."""

    __tablename__ = "product_categories"

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"),
        primary_key=True,
    )

    product = relationship("Product", back_populates="category_links")
    category = relationship("Category", back_populates="product_tag_links")
