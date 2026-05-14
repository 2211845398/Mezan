"""General ledger journal batches (Epic 5)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class JournalEntry(Base):
    """Immutable posted journal batch (double-entry)."""

    __tablename__ = "journal_entries"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_journal_entries_idempotency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    source_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(256), nullable=False)
    period_id: Mapped[int | None] = mapped_column(
        ForeignKey("fiscal_periods.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reverses_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    lines = relationship(
        "JournalEntryLine",
        back_populates="journal_entry",
        cascade="all, delete-orphan",
    )


class JournalEntryLine(Base):
    """GL line with mandatory branch dimension and multi-currency support (Epic 20.1)."""

    __tablename__ = "journal_entry_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    journal_entry_id: Mapped[int] = mapped_column(
        ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    memo: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Epic 20.1: Multi-currency support
    currency_code: Mapped[str] = mapped_column(
        String(3), nullable=False, default="USD"
    )  # ISO currency code
    transaction_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )  # Amount in foreign currency
    fx_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 8), nullable=True
    )  # Exchange rate to base currency

    journal_entry = relationship("JournalEntry", back_populates="lines")
