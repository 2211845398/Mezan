"""epic2_invoice_scans

Revision ID: 7f1e9e0c8a44
Revises: 6a6c2d7a9e31
Create Date: 2026-03-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "7f1e9e0c8a44"
down_revision: str | None = "6a6c2d7a9e31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "invoice_scans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="received"),
        sa.Column(
            "raw_input_ref",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("raw_output", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("parsed_output", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("override_output", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_invoice_scans_id", "invoice_scans", ["id"])


def downgrade() -> None:
    op.drop_index("ix_invoice_scans_id", table_name="invoice_scans")
    op.drop_table("invoice_scans")

