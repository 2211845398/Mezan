"""Units of measure for catalog products (piece, box, kg, etc.)."""

from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    measurement_category: Mapped[str] = mapped_column(
        String(32), nullable=False, default="discrete"
    )  # discrete, weight, length, volume

    products = relationship("Product", back_populates="unit_of_measure")
    product_conversions = relationship(
        "ProductUnitConversion",
        back_populates="unit_of_measure",
    )
