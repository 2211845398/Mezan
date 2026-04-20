"""GL milestone 2: card/other clearing + sales discount accounts on accounting_settings.

Revision ID: f0a1b2c3d4e5
Revises: d8f1a2c3e4b5
Create Date: 2026-04-20

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: str | None = "d8f1a2c3e4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()

    for code, name, atype in (
        ("1010", "Card Clearing", "asset"),
        ("1015", "Other Payments Clearing", "asset"),
        ("4090", "Sales Discounts", "expense"),
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
        sa.Column("default_card_clearing_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "accounting_settings",
        sa.Column("default_other_clearing_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "accounting_settings",
        sa.Column("default_sales_discount_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_accounting_settings_default_card_clearing",
        "accounting_settings",
        "chart_accounts",
        ["default_card_clearing_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_accounting_settings_default_other_clearing",
        "accounting_settings",
        "chart_accounts",
        ["default_other_clearing_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_accounting_settings_default_sales_discount",
        "accounting_settings",
        "chart_accounts",
        ["default_sales_discount_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    bind.execute(
        sa.text(
            """
            UPDATE accounting_settings AS s
            SET
                default_card_clearing_account_id = c1010.id,
                default_other_clearing_account_id = c1015.id,
                default_sales_discount_account_id = d4090.id
            FROM chart_accounts AS c1010,
                 chart_accounts AS c1015,
                 chart_accounts AS d4090
            WHERE s.id = 1
              AND c1010.code = '1010'
              AND c1015.code = '1015'
              AND d4090.code = '4090'
            """
        )
    )

    op.alter_column(
        "accounting_settings",
        "default_card_clearing_account_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "accounting_settings",
        "default_other_clearing_account_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "accounting_settings",
        "default_sales_discount_account_id",
        existing_type=sa.Integer(),
        nullable=False,
    )

    bind.execute(
        sa.text(
            "SELECT setval(pg_get_serial_sequence('chart_accounts', 'id'), "
            "(SELECT COALESCE(MAX(id), 1) FROM chart_accounts))"
        )
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_accounting_settings_default_sales_discount", "accounting_settings", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_accounting_settings_default_other_clearing", "accounting_settings", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_accounting_settings_default_card_clearing", "accounting_settings", type_="foreignkey"
    )
    op.drop_column("accounting_settings", "default_sales_discount_account_id")
    op.drop_column("accounting_settings", "default_other_clearing_account_id")
    op.drop_column("accounting_settings", "default_card_clearing_account_id")
