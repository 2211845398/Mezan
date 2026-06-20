"""SQLAlchemy ORM model for OTP-based password reset challenges."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class PasswordResetChallenge(Base):
    """OTP challenge for password reset; issues a short-lived reset token after verification."""

    __tablename__ = "password_reset_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    challenge_token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    otp_code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    reset_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    otp_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reset_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    user = relationship("User", back_populates="password_reset_challenges")
