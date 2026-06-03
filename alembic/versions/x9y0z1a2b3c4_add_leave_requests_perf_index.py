"""Add composite index for leave_requests list queries.

Revision ID: x9y0z1a2b3c4
Revises: w8x9y0z1a2b3
Create Date: 2026-06-03

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "x9y0z1a2b3c4"
down_revision: str | None = "w8x9y0z1a2b3"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_index(
        "ix_leave_requests_perf",
        "leave_requests",
        ["is_deleted", "status", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_leave_requests_perf", table_name="leave_requests")
