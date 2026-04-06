"""SQLAlchemy model for employee attendance logs (Epic 4.2)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_profile_id: Mapped[int] = mapped_column(
        ForeignKey("employee_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    clock_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    clock_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
