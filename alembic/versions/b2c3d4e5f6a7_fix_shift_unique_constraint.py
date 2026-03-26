"""fix_shift_unique_constraint

Replace the blanket UniqueConstraint(terminal_id, status) with a partial
unique index that only enforces uniqueness when status = 'open'.
This allows unlimited closed shifts per terminal.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_pos_shifts_terminal_status_open", "pos_shifts", type_="unique")
    op.create_index(
        "uq_pos_shifts_terminal_open",
        "pos_shifts",
        ["terminal_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index("uq_pos_shifts_terminal_open", "pos_shifts")
    op.create_unique_constraint(
        "uq_pos_shifts_terminal_status_open", "pos_shifts", ["terminal_id", "status"]
    )
