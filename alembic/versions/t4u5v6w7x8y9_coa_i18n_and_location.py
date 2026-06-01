"""Chart of accounts: bilingual names and branch/POS location scope.

Revision ID: t4u5v6w7x8y9
Revises: s2t3u4v5w6
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t4u5v6w7x8y9"
down_revision: Union[str, None] = "s2t3u4v5w6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chart_accounts",
        sa.Column("name_ar", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "chart_accounts",
        sa.Column("name_en", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "chart_accounts",
        sa.Column("branch_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "chart_accounts",
        sa.Column("pos_terminal_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_chart_accounts_branch_id",
        "chart_accounts",
        "branches",
        ["branch_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_chart_accounts_pos_terminal_id",
        "chart_accounts",
        "pos_terminals",
        ["pos_terminal_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_chart_accounts_branch_id", "chart_accounts", ["branch_id"])
    op.create_index(
        "ix_chart_accounts_pos_terminal_id", "chart_accounts", ["pos_terminal_id"]
    )
    # Backfill bilingual names from legacy name column.
    op.execute(
        sa.text(
            "UPDATE chart_accounts SET name_en = name, name_ar = name "
            "WHERE name_en IS NULL OR name_ar IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_chart_accounts_pos_terminal_id", table_name="chart_accounts")
    op.drop_index("ix_chart_accounts_branch_id", table_name="chart_accounts")
    op.drop_constraint(
        "fk_chart_accounts_pos_terminal_id", "chart_accounts", type_="foreignkey"
    )
    op.drop_constraint("fk_chart_accounts_branch_id", "chart_accounts", type_="foreignkey")
    op.drop_column("chart_accounts", "pos_terminal_id")
    op.drop_column("chart_accounts", "branch_id")
    op.drop_column("chart_accounts", "name_en")
    op.drop_column("chart_accounts", "name_ar")
