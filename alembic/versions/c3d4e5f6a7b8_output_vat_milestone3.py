"""Milestone 3: output VAT on products, cart/invoice snapshots, GL output tax payable.

Revision ID: c3d4e5f6a7b8
Revises: f0a1b2c3d4e5
Create Date: 2026-04-20

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "f0a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        "products",
        sa.Column(
            "output_vat_rate",
            sa.Numeric(8, 4),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "pos_cart_lines",
        sa.Column(
            "tax_rate",
            sa.Numeric(8, 4),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "pos_cart_lines",
        sa.Column(
            "line_tax_amount",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "pos_carts",
        sa.Column(
            "tax_total",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "sales_invoices",
        sa.Column(
            "tax_total",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "sales_invoice_lines",
        sa.Column(
            "tax_rate",
            sa.Numeric(8, 4),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "sales_invoice_lines",
        sa.Column(
            "line_tax_amount",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

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
        {"p_code": "2200", "p_name": "Output VAT Payable", "p_atype": "liability", "p_code_exists": "2200"},
    )

    op.add_column(
        "accounting_settings",
        sa.Column("default_output_tax_payable_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_accounting_settings_default_output_tax_payable",
        "accounting_settings",
        "chart_accounts",
        ["default_output_tax_payable_account_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    bind.execute(
        sa.text(
            """
            UPDATE accounting_settings AS s
            SET default_output_tax_payable_account_id = v.id
            FROM chart_accounts AS v
            WHERE s.id = 1 AND v.code = '2200'
            """
        )
    )

    op.alter_column(
        "accounting_settings",
        "default_output_tax_payable_account_id",
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
        "fk_accounting_settings_default_output_tax_payable",
        "accounting_settings",
        type_="foreignkey",
    )
    op.drop_column("accounting_settings", "default_output_tax_payable_account_id")
    op.drop_column("sales_invoice_lines", "line_tax_amount")
    op.drop_column("sales_invoice_lines", "tax_rate")
    op.drop_column("sales_invoices", "tax_total")
    op.drop_column("pos_carts", "tax_total")
    op.drop_column("pos_cart_lines", "line_tax_amount")
    op.drop_column("pos_cart_lines", "tax_rate")
    op.drop_column("products", "output_vat_rate")
