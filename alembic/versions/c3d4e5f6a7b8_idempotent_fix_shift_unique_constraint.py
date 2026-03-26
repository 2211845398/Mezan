"""Idempotent fix for pos shift unique constraint.

Ensures `pos_shifts` allows multiple closed shifts per terminal by:
1) Removing the legacy unique constraint `uq_pos_shifts_terminal_status_open` (terminal_id, status)
2) Creating (or ensuring) a partial unique index `uq_pos_shifts_terminal_open` that applies only when status='open'
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_pos_shifts_terminal_status_open'
          AND conrelid = 'pos_shifts'::regclass
    ) THEN
        ALTER TABLE pos_shifts DROP CONSTRAINT uq_pos_shifts_terminal_status_open;
    END IF;
END $$;
"""
    )

    # Partial unique index: only one OPEN shift per terminal.
    op.execute(
        """
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_shifts_terminal_open
ON pos_shifts (terminal_id)
WHERE status = 'open';
"""
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_pos_shifts_terminal_open;")

    # Restore the legacy constraint (not recommended for production; downgrade only).
    op.execute(
        """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_pos_shifts_terminal_status_open'
          AND conrelid = 'pos_shifts'::regclass
    ) THEN
        ALTER TABLE pos_shifts
        ADD CONSTRAINT uq_pos_shifts_terminal_status_open UNIQUE (terminal_id, status);
    END IF;
END $$;
"""
    )

