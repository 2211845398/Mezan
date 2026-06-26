"""Staff correspondence threads and messages."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class CorrespondenceRequestType(StrEnum):
    ADMINISTRATIVE = "administrative"
    HR = "hr"
    IT = "it"
    FINANCE = "finance"
    GENERAL = "general"


class CorrespondenceThreadStatus(StrEnum):
    OPEN = "open"
    ANSWERED = "answered"
    CLOSED = "closed"


class CorrespondenceThread(Base):
    __tablename__ = "correspondence_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    request_type: Mapped[str] = mapped_column(String(32), nullable=False)
    initiator_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_role_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    branch_id: Mapped[int | None] = mapped_column(
        ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=CorrespondenceThreadStatus.OPEN.value
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


class CorrespondenceMessage(Base):
    __tablename__ = "correspondence_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("correspondence_threads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal_note: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
