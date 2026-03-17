"""SQLAlchemy ORM model for invoice scan OCR/QR pipeline (Epic 2)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class InvoiceScan(Base):
    __tablename__ = "invoice_scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)  # qr, image
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="received", nullable=False
    )  # received, parsed, needs_review, validated, failed

    raw_input_ref: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    raw_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    parsed_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    override_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
