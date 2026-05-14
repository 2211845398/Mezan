"""SQLAlchemy model for accounting fiscal periods and lock status."""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class FiscalPeriod(Base):
    __tablename__ = "fiscal_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period_key: Mapped[str] = mapped_column(String(7), nullable=False, unique=True, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    period_end: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="open"
    )  # open, soft_closed, closed
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
