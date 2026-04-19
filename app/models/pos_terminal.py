"""SQLAlchemy ORM model for POS terminals (register and authorize)."""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class POSTerminal(Base):
    """Physical POS terminal; is_authorized allows it to process transactions."""

    __tablename__ = "pos_terminals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    terminal_code: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    api_key_hash: Mapped[str] = mapped_column(String(255), nullable=False)  # hash of API key
    is_authorized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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

    branch = relationship("Branch", back_populates="pos_terminals")
