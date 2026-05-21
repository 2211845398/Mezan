"""SQLAlchemy ORM model for category dynamic attribute definitions."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class CategoryAttributeDef(Base):
    """Defines dynamic attribute schema for a category (key/type/options/validation)."""

    __tablename__ = "category_attribute_defs"
    __table_args__ = (UniqueConstraint("category_id", "key", name="uq_cat_attr_defs_category_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inherited_from_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="When set, this row was propagated from the given ancestor category.",
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # text, int, float, bool, date...
    required: Mapped[bool] = mapped_column(default=False, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    validation: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attribute_id: Mapped[int | None] = mapped_column(
        ForeignKey("attributes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="When set, links this category key to the global attribute catalog.",
    )
    use_for_variants: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="When true, this attribute participates in variant Cartesian generation.",
    )
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

    category = relationship(
        "Category",
        back_populates="attribute_defs",
        foreign_keys="CategoryAttributeDef.category_id",
    )
    catalog_attribute = relationship("CatalogAttribute", foreign_keys=[attribute_id])
