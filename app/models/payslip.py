"""SQLAlchemy model for payroll payslips (Epic 4.3)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum as PyEnum

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class PayslipStatus(PyEnum):
    DRAFT = "draft"
    APPROVED = "approved"


class Payslip(Base):
    __tablename__ = "payslips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_profile_id: Mapped[int] = mapped_column(
        ForeignKey("employee_profiles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    hours_worked: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[PayslipStatus] = mapped_column(
        Enum(PayslipStatus, native_enum=False), nullable=False, default=PayslipStatus.DRAFT
    )
    immutable_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
