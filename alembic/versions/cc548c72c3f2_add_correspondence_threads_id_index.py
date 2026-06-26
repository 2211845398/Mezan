"""add_correspondence_threads_id_index

Revision ID: cc548c72c3f2
Revises: h4i5j6k7l8m9
Create Date: 2026-06-26 10:32:30.293326

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "cc548c72c3f2"
down_revision: str | None = "h4i5j6k7l8m9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        op.f("ix_correspondence_threads_id"),
        "correspondence_threads",
        ["id"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_correspondence_threads_id"),
        table_name="correspondence_threads",
        if_exists=True,
    )
