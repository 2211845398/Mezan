"""SQLAlchemy model for employee HR profile (Epic 4.1)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)
    base_salary: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    bank_account: Mapped[str | None] = mapped_column(String(128), nullable=True)
    annual_leave_entitlement_days: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 2), nullable=True
    )
    identity_document_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    identity_document_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    identity_document_image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
