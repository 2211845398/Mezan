"""RBAC role-based attendance and payroll deduction policies (SRS)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum as PyEnum

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AttendancePolicyCategory(PyEnum):
    EXEMPT = "exempt"
    OFFICE = "office"
    OPERATIONAL = "operational"


class AttendancePayrollPolicy(Base):
    """Per system role code: grace period, deduction amounts, overtime multiplier."""

    __tablename__ = "attendance_payroll_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    role_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    attendance_category: Mapped[str] = mapped_column(
        String(32), nullable=False, default=AttendancePolicyCategory.OFFICE.value
    )
    grace_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    absence_deduction_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    late_deduction_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    early_close_deduction_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    overtime_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), nullable=False, default=Decimal("1.50")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
