"""epic5_accounting_gl

Revision ID: b7e9a1c2d3f4
Revises: 8c6e82fe0802
Create Date: 2026-04-12

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7e9a1c2d3f4"
down_revision: str | None = "8c6e82fe0802"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "currencies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=3), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("decimal_places", sa.Integer(), nullable=False),
        sa.Column("suffix", sa.String(length=16), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_currencies_code"), "currencies", ["code"], unique=True)
    op.create_index(op.f("ix_currencies_id"), "currencies", ["id"], unique=False)

    op.create_table(
        "chart_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "account_type",
            sa.Enum(
                "asset",
                "liability",
                "equity",
                "revenue",
                "expense",
                name="accounttype",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("is_control", sa.Boolean(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["chart_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chart_accounts_account_type"), "chart_accounts", ["account_type"], unique=False)
    op.create_index(op.f("ix_chart_accounts_code"), "chart_accounts", ["code"], unique=True)
    op.create_index(op.f("ix_chart_accounts_id"), "chart_accounts", ["id"], unique=False)
    op.create_index(op.f("ix_chart_accounts_parent_id"), "chart_accounts", ["parent_id"], unique=False)

    op.create_table(
        "accounting_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("base_currency_id", sa.Integer(), nullable=False),
        sa.Column("default_cash_account_id", sa.Integer(), nullable=False),
        sa.Column("default_ar_account_id", sa.Integer(), nullable=False),
        sa.Column("default_ap_account_id", sa.Integer(), nullable=False),
        sa.Column("default_inventory_account_id", sa.Integer(), nullable=False),
        sa.Column("default_cogs_account_id", sa.Integer(), nullable=False),
        sa.Column("default_sales_revenue_account_id", sa.Integer(), nullable=False),
        sa.Column("default_salary_expense_account_id", sa.Integer(), nullable=False),
        sa.Column("default_payroll_liability_account_id", sa.Integer(), nullable=False),
        sa.Column("default_payroll_deductions_payable_account_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["base_currency_id"], ["currencies.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["default_ap_account_id"], ["chart_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["default_ar_account_id"], ["chart_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["default_cash_account_id"], ["chart_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["default_cogs_account_id"], ["chart_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["default_inventory_account_id"], ["chart_accounts.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["default_payroll_deductions_payable_account_id"],
            ["chart_accounts.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["default_payroll_liability_account_id"], ["chart_accounts.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["default_salary_expense_account_id"], ["chart_accounts.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["default_sales_revenue_account_id"], ["chart_accounts.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("currency_id", sa.Integer(), nullable=False),
        sa.Column("payables_account_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["currency_id"], ["currencies.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payables_account_id"], ["chart_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_suppliers_code"), "suppliers", ["code"], unique=True)
    op.create_index(op.f("ix_suppliers_currency_id"), "suppliers", ["currency_id"], unique=False)
    op.create_index(op.f("ix_suppliers_id"), "suppliers", ["id"], unique=False)
    op.create_index(op.f("ix_suppliers_name"), "suppliers", ["name"], unique=False)
    op.create_index(
        op.f("ix_suppliers_payables_account_id"), "suppliers", ["payables_account_id"], unique=False
    )

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("idempotency_key", sa.String(length=256), nullable=False),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index(op.f("ix_journal_entries_entry_date"), "journal_entries", ["entry_date"], unique=False)
    op.create_index(op.f("ix_journal_entries_id"), "journal_entries", ["id"], unique=False)
    op.create_index(op.f("ix_journal_entries_source_id"), "journal_entries", ["source_id"], unique=False)
    op.create_index(
        op.f("ix_journal_entries_source_type"), "journal_entries", ["source_type"], unique=False
    )

    op.create_table(
        "journal_entry_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("journal_entry_id", sa.Integer(), nullable=False),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("debit", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("credit", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("memo", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["account_id"], ["chart_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["journal_entry_id"], ["journal_entries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_journal_entry_lines_account_id"), "journal_entry_lines", ["account_id"], unique=False
    )
    op.create_index(
        op.f("ix_journal_entry_lines_branch_id"), "journal_entry_lines", ["branch_id"], unique=False
    )
    op.create_index(
        op.f("ix_journal_entry_lines_id"), "journal_entry_lines", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_journal_entry_lines_journal_entry_id"),
        "journal_entry_lines",
        ["journal_entry_id"],
        unique=False,
    )

    op.create_table(
        "branch_product_costs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("average_unit_cost", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "product_id", name="uq_branch_product_costs_branch_product"),
    )
    op.create_index(
        op.f("ix_branch_product_costs_branch_id"), "branch_product_costs", ["branch_id"], unique=False
    )
    op.create_index(
        op.f("ix_branch_product_costs_id"), "branch_product_costs", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_branch_product_costs_product_id"), "branch_product_costs", ["product_id"], unique=False
    )

    op.add_column(
        "products",
        sa.Column("standard_cost", sa.Numeric(precision=14, scale=4), nullable=True),
    )
    op.add_column(
        "customer_profiles",
        sa.Column("default_currency_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "customer_profiles",
        sa.Column("receivables_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_customer_profiles_default_currency",
        "customer_profiles",
        "currencies",
        ["default_currency_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_customer_profiles_receivables_account",
        "customer_profiles",
        "chart_accounts",
        ["receivables_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_customer_profiles_default_currency_id"),
        "customer_profiles",
        ["default_currency_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_customer_profiles_receivables_account_id"),
        "customer_profiles",
        ["receivables_account_id"],
        unique=False,
    )

    op.add_column(
        "goods_receipts",
        sa.Column("supplier_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_goods_receipts_supplier_id",
        "goods_receipts",
        "suppliers",
        ["supplier_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_goods_receipts_supplier_id"), "goods_receipts", ["supplier_id"], unique=False)

    op.add_column(
        "purchase_orders",
        sa.Column("supplier_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_purchase_orders_supplier_id",
        "purchase_orders",
        "suppliers",
        ["supplier_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_purchase_orders_supplier_id"), "purchase_orders", ["supplier_id"], unique=False)

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            INSERT INTO currencies (id, code, name, decimal_places, suffix)
            VALUES (1, 'USD', 'US Dollar', 2, NULL)
            """
        )
    )
    bind.execute(
        sa.text(
            """
            INSERT INTO chart_accounts (id, code, name, account_type, parent_id, is_control, is_system, active)
            VALUES
            (1, '1000', 'Cash on Hand', 'asset', NULL, false, true, true),
            (2, '1100', 'Accounts Receivable', 'asset', NULL, true, true, true),
            (3, '1200', 'Inventory', 'asset', NULL, false, true, true),
            (4, '2000', 'Accounts Payable', 'liability', NULL, true, true, true),
            (5, '2100', 'Payroll Liability', 'liability', NULL, false, true, true),
            (6, '2110', 'Payroll Deductions Payable', 'liability', NULL, false, true, true),
            (7, '4000', 'Sales Revenue', 'revenue', NULL, false, true, true),
            (8, '5000', 'Cost of Goods Sold', 'expense', NULL, false, true, true),
            (9, '6000', 'Salary Expense', 'expense', NULL, false, true, true)
            """
        )
    )
    bind.execute(
        sa.text(
            """
            INSERT INTO accounting_settings (
                id, base_currency_id,
                default_cash_account_id, default_ar_account_id, default_ap_account_id,
                default_inventory_account_id, default_cogs_account_id, default_sales_revenue_account_id,
                default_salary_expense_account_id, default_payroll_liability_account_id,
                default_payroll_deductions_payable_account_id
            ) VALUES (
                1, 1,
                1, 2, 4,
                3, 8, 7,
                9, 5, 6
            )
            """
        )
    )
    bind.execute(
        sa.text(
            "SELECT setval(pg_get_serial_sequence('currencies', 'id'), "
            "(SELECT COALESCE(MAX(id), 1) FROM currencies))"
        )
    )
    bind.execute(
        sa.text(
            "SELECT setval(pg_get_serial_sequence('chart_accounts', 'id'), "
            "(SELECT COALESCE(MAX(id), 1) FROM chart_accounts))"
        )
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_purchase_orders_supplier_id"), table_name="purchase_orders")
    op.drop_constraint("fk_purchase_orders_supplier_id", "purchase_orders", type_="foreignkey")
    op.drop_column("purchase_orders", "supplier_id")

    op.drop_index(op.f("ix_goods_receipts_supplier_id"), table_name="goods_receipts")
    op.drop_constraint("fk_goods_receipts_supplier_id", "goods_receipts", type_="foreignkey")
    op.drop_column("goods_receipts", "supplier_id")

    op.drop_index(op.f("ix_customer_profiles_receivables_account_id"), table_name="customer_profiles")
    op.drop_index(op.f("ix_customer_profiles_default_currency_id"), table_name="customer_profiles")
    op.drop_constraint("fk_customer_profiles_receivables_account", "customer_profiles", type_="foreignkey")
    op.drop_constraint("fk_customer_profiles_default_currency", "customer_profiles", type_="foreignkey")
    op.drop_column("customer_profiles", "receivables_account_id")
    op.drop_column("customer_profiles", "default_currency_id")

    op.drop_column("products", "standard_cost")

    op.drop_table("branch_product_costs")
    op.drop_table("journal_entry_lines")
    op.drop_table("journal_entries")
    op.drop_table("suppliers")
    op.drop_table("accounting_settings")
    op.drop_table("chart_accounts")
    op.drop_table("currencies")
