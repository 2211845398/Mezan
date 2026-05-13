"""Add default_inventory_gain_account_id and default_other_expenses_account_id.

Revision ID: d1a2b3c4e5f6
Revises: c2e9b8a1d4f7
Create Date: 2026-05-13

Phase 2 Workstream C: inventory adjustment gain routing and POS/misc expense default.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1a2b3c4e5f6"
down_revision: Union[str, None] = "c2e9b8a1d4f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounting_settings",
        sa.Column("default_inventory_gain_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "accounting_settings",
        sa.Column("default_other_expenses_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_accounting_settings_default_inventory_gain_account_id_chart_accounts"),
        "accounting_settings",
        "chart_accounts",
        ["default_inventory_gain_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_accounting_settings_default_other_expenses_account_id_chart_accounts"),
        "accounting_settings",
        "chart_accounts",
        ["default_other_expenses_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_accounting_settings_default_other_expenses_account_id_chart_accounts"),
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_accounting_settings_default_inventory_gain_account_id_chart_accounts"),
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_column("accounting_settings", "default_other_expenses_account_id")
    op.drop_column("accounting_settings", "default_inventory_gain_account_id")
