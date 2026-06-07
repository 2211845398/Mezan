"""add branch kind (commercial / warehouse)

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b3c4d5e6f7a8"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "branches",
        sa.Column(
            "kind",
            sa.String(length=32),
            nullable=False,
            server_default="commercial",
        ),
    )
    op.create_index("ix_branches_kind", "branches", ["kind"])


def downgrade() -> None:
    op.drop_index("ix_branches_kind", table_name="branches")
    op.drop_column("branches", "kind")
