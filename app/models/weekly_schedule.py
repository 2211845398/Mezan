"""SQLAlchemy model for employee weekly schedules (Epic 4.1)."""

from __future__ import annotations

from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, SmallInteger, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class WeeklySchedule(Base):
    __tablename__ = "weekly_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_profile_id: Mapped[int] = mapped_column(
        ForeignKey("employee_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=Mon ... 6=Sun
    start_time: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
    end_time: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
    is_day_off: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
