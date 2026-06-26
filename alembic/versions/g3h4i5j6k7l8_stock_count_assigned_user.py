"""Add assigned_user_id to stock count sessions.

Revision ID: g3h4i5j6k7l8
Revises: f2a3b4c5d6e7
Create Date: 2026-06-23
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "g3h4i5j6k7l8"
down_revision: str | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "stock_count_sessions",
        sa.Column("assigned_user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_stock_count_sessions_assigned_user_id",
        "stock_count_sessions",
        "users",
        ["assigned_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_stock_count_sessions_assigned_user_id",
        "stock_count_sessions",
        ["assigned_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_stock_count_sessions_assigned_user_id", table_name="stock_count_sessions")
    op.drop_constraint(
        "fk_stock_count_sessions_assigned_user_id",
        "stock_count_sessions",
        type_="foreignkey",
    )
    op.drop_column("stock_count_sessions", "assigned_user_id")
