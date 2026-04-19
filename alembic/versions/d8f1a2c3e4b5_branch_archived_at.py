"""branch archived_at soft delete

Revision ID: d8f1a2c3e4b5
Revises: bb3d116e80a1
Create Date: 2026-04-19

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d8f1a2c3e4b5"
down_revision: str | None = "bb3d116e80a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "branches",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_branches_archived_at"), "branches", ["archived_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_branches_archived_at"), table_name="branches")
    op.drop_column("branches", "archived_at")
