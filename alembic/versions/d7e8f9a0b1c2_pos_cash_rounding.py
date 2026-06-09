"""POS cash rounding: currency increment, invoice amount_paid/rounding_difference, GL account."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: str | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "currencies",
        sa.Column("cash_rounding_increment", sa.Numeric(6, 4), nullable=True),
    )
    op.add_column(
        "sales_invoices",
        sa.Column(
            "rounding_difference",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "sales_invoices",
        sa.Column("amount_paid", sa.Numeric(12, 2), nullable=True),
    )
    op.execute("UPDATE sales_invoices SET amount_paid = total WHERE amount_paid IS NULL")
    op.alter_column("sales_invoices", "amount_paid", nullable=False)
    op.add_column(
        "accounting_settings",
        sa.Column("default_rounding_difference_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f(
            "fk_accounting_settings_default_rounding_difference_account_id_chart_accounts"
        ),
        "accounting_settings",
        "chart_accounts",
        ["default_rounding_difference_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.execute(
        "UPDATE currencies SET cash_rounding_increment = 0.05 WHERE code = 'USD' AND cash_rounding_increment IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f(
            "fk_accounting_settings_default_rounding_difference_account_id_chart_accounts"
        ),
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_column("accounting_settings", "default_rounding_difference_account_id")
    op.drop_column("sales_invoices", "amount_paid")
    op.drop_column("sales_invoices", "rounding_difference")
    op.drop_column("currencies", "cash_rounding_increment")
