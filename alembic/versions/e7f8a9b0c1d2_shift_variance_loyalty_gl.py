"""Milestone 5: POS shift cash variance GL + loyalty liability / expense accounts.

Revision ID: e7f8a9b0c1d2
Revises: c3d4e5f6a7b8
Create Date: 2026-04-20

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()

    for code, name, atype in (
        ("1020", "Cash Over and Short", "expense"),
        ("2120", "Loyalty Points Liability", "liability"),
        ("6100", "Loyalty Program Expense", "expense"),
    ):
        bind.execute(
            sa.text(
                """
                INSERT INTO chart_accounts (code, name, account_type, parent_id, is_control, is_system, active)
                SELECT CAST(:p_code AS VARCHAR(32)),
                       CAST(:p_name AS VARCHAR(255)),
                       CAST(:p_atype AS VARCHAR(32)),
                       NULL, false, true, true
                WHERE NOT EXISTS (
                    SELECT 1 FROM chart_accounts
                    WHERE code = CAST(:p_code_exists AS VARCHAR(32))
                )
                """
            ),
            {"p_code": code, "p_name": name, "p_atype": atype, "p_code_exists": code},
        )

    op.add_column(
        "accounting_settings",
        sa.Column("default_cash_over_short_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "accounting_settings",
        sa.Column("default_loyalty_liability_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "accounting_settings",
        sa.Column("default_loyalty_expense_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "accounting_settings",
        sa.Column(
            "default_loyalty_point_value",
            sa.Numeric(precision=12, scale=4),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_accounting_settings_default_cash_over_short",
        "accounting_settings",
        "chart_accounts",
        ["default_cash_over_short_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_accounting_settings_default_loyalty_liability",
        "accounting_settings",
        "chart_accounts",
        ["default_loyalty_liability_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_accounting_settings_default_loyalty_expense",
        "accounting_settings",
        "chart_accounts",
        ["default_loyalty_expense_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    bind.execute(
        sa.text(
            """
            UPDATE accounting_settings AS s
            SET
                default_cash_over_short_account_id = c1020.id,
                default_loyalty_liability_account_id = c2120.id,
                default_loyalty_expense_account_id = c6100.id,
                default_loyalty_point_value = CAST(0.01 AS NUMERIC(12, 4))
            FROM chart_accounts AS c1020,
                 chart_accounts AS c2120,
                 chart_accounts AS c6100
            WHERE s.id = 1
              AND c1020.code = '1020'
              AND c2120.code = '2120'
              AND c6100.code = '6100'
            """
        )
    )

    op.alter_column(
        "accounting_settings",
        "default_cash_over_short_account_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "accounting_settings",
        "default_loyalty_liability_account_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "accounting_settings",
        "default_loyalty_expense_account_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "accounting_settings",
        "default_loyalty_point_value",
        existing_type=sa.Numeric(precision=12, scale=4),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_accounting_settings_default_loyalty_expense",
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_accounting_settings_default_loyalty_liability",
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_accounting_settings_default_cash_over_short",
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_column("accounting_settings", "default_loyalty_point_value")
    op.drop_column("accounting_settings", "default_loyalty_expense_account_id")
    op.drop_column("accounting_settings", "default_loyalty_liability_account_id")
    op.drop_column("accounting_settings", "default_cash_over_short_account_id")
