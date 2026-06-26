"""Employee HR feedback submissions (mobile self-service)."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum as PyEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class HrFeedbackCategory(PyEnum):
    ISSUE = "issue"
    SUGGESTION = "suggestion"
    QUESTION = "question"


class HrFeedbackStatus(PyEnum):
    SUBMITTED = "submitted"
    REVIEWED = "reviewed"


class HrFeedback(Base):
    __tablename__ = "hr_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employee_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("employee_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    branch_id: Mapped[int | None] = mapped_column(
        ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=HrFeedbackStatus.SUBMITTED.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
