"""Add branches.accounting_chart_provisioned_at (Epic 19.7).

Revision ID: f1e2d3c4b5a6
Revises: d1a2b3c4e5f6
Create Date: 2026-05-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, None] = "d1a2b3c4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "branches",
        sa.Column("accounting_chart_provisioned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_branches_accounting_chart_provisioned_at",
        "branches",
        ["accounting_chart_provisioned_at"],
        unique=False,
    )
    op.execute(
        text(
            "UPDATE branches SET accounting_chart_provisioned_at = created_at "
            "WHERE accounting_chart_provisioned_at IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_branches_accounting_chart_provisioned_at", table_name="branches")
    op.drop_column("branches", "accounting_chart_provisioned_at")
