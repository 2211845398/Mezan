"""Currency master (Epic 5)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Currency(Base):
    __tablename__ = "currencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(3), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    decimal_places: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    suffix: Mapped[str | None] = mapped_column(String(16), nullable=True)
    #: Units of functional (base) currency per one unit of this currency; used for POS snapshots.
    exchange_rate_to_base: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 8), nullable=True, default=None
    )
