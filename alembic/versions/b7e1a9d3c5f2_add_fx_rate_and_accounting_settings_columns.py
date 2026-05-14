"""Add AR/AP fx_rate, accounting_settings valuation and GL routing columns.

Revision ID: b7e1a9d3c5f2
Revises: a3f8c2b1e4d0
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e1a9d3c5f2"
down_revision: Union[str, None] = "a3f8c2b1e4d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ar_open_items",
        sa.Column("fx_rate", sa.Numeric(precision=18, scale=8), nullable=True),
    )
    op.add_column(
        "ap_open_items",
        sa.Column("fx_rate", sa.Numeric(precision=18, scale=8), nullable=True),
    )

    op.execute(
        sa.text("""
            UPDATE ar_open_items AS ai
            SET fx_rate = COALESCE(
                (
                    SELECT c.exchange_rate_to_base
                    FROM currencies c
                    WHERE c.code = TRIM(BOTH FROM ai.currency_code)
                    LIMIT 1
                ),
                CAST(1 AS NUMERIC(18, 8))
            )
            WHERE ai.fx_rate IS NULL
        """)
    )
    op.execute(
        sa.text("""
            UPDATE ap_open_items AS ap
            SET fx_rate = COALESCE(
                (
                    SELECT c.exchange_rate_to_base
                    FROM currencies c
                    WHERE c.code = TRIM(BOTH FROM ap.currency_code)
                    LIMIT 1
                ),
                CAST(1 AS NUMERIC(18, 8))
            )
            WHERE ap.fx_rate IS NULL
        """)
    )

    op.add_column(
        "accounting_settings",
        sa.Column(
            "inventory_valuation_policy",
            sa.String(length=8),
            nullable=False,
            server_default="wavg",
        ),
    )
    op.create_check_constraint(
        "ck_accounting_settings_inventory_valuation_policy",
        "accounting_settings",
        "inventory_valuation_policy IN ('wavg','fifo')",
    )

    op.add_column(
        "accounting_settings",
        sa.Column("default_wip_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "accounting_settings",
        sa.Column("default_inventory_shortage_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "accounting_settings",
        sa.Column("default_inventory_damaged_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_accounting_settings_default_wip_account_id_chart_accounts"),
        "accounting_settings",
        "chart_accounts",
        ["default_wip_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_accounting_settings_default_inventory_shortage_account_id_chart_accounts"),
        "accounting_settings",
        "chart_accounts",
        ["default_inventory_shortage_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_accounting_settings_default_inventory_damaged_account_id_chart_accounts"),
        "accounting_settings",
        "chart_accounts",
        ["default_inventory_damaged_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_accounting_settings_default_inventory_damaged_account_id_chart_accounts"),
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_accounting_settings_default_inventory_shortage_account_id_chart_accounts"),
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_accounting_settings_default_wip_account_id_chart_accounts"),
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_column("accounting_settings", "default_inventory_damaged_account_id")
    op.drop_column("accounting_settings", "default_inventory_shortage_account_id")
    op.drop_column("accounting_settings", "default_wip_account_id")

    op.drop_constraint(
        "ck_accounting_settings_inventory_valuation_policy",
        "accounting_settings",
        type_="check",
    )
    op.drop_column("accounting_settings", "inventory_valuation_policy")

    op.drop_column("ap_open_items", "fx_rate")
    op.drop_column("ar_open_items", "fx_rate")
