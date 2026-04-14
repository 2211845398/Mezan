"""epic7_11_backend_foundations

Revision ID: 6f3d5a9b0c11
Revises: b7e9a1c2d3f4
Create Date: 2026-04-14
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "6f3d5a9b0c11"
down_revision: str | None = "b7e9a1c2d3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("roles", sa.Column("code", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_roles_code"), "roles", ["code"], unique=True)
    op.execute(sa.text("UPDATE roles SET code = 'ADMIN' WHERE name = 'Admin' AND code IS NULL"))

    op.create_table(
        "user_onboardings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("assigned_hr_user_id", sa.Integer(), nullable=True),
        sa.Column("job_title", sa.String(length=128), nullable=True),
        sa.Column("contract_start", sa.Date(), nullable=True),
        sa.Column("contract_end", sa.Date(), nullable=True),
        sa.Column("salary_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("salary_currency", sa.String(length=8), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assigned_hr_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(op.f("ix_user_onboardings_assigned_hr_user_id"), "user_onboardings", ["assigned_hr_user_id"], unique=False)
    op.create_index(op.f("ix_user_onboardings_id"), "user_onboardings", ["id"], unique=False)
    op.create_index(op.f("ix_user_onboardings_user_id"), "user_onboardings", ["user_id"], unique=True)

    op.create_table(
        "user_permission_overrides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=True),
        sa.Column("effect", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "permission_id",
            "branch_id",
            name="uq_user_permission_override_scope",
        ),
    )
    op.create_index(op.f("ix_user_permission_overrides_branch_id"), "user_permission_overrides", ["branch_id"], unique=False)
    op.create_index(op.f("ix_user_permission_overrides_id"), "user_permission_overrides", ["id"], unique=False)
    op.create_index(op.f("ix_user_permission_overrides_permission_id"), "user_permission_overrides", ["permission_id"], unique=False)
    op.create_index(op.f("ix_user_permission_overrides_user_id"), "user_permission_overrides", ["user_id"], unique=False)

    op.add_column("payment_receipts", sa.Column("card_last4", sa.String(length=4), nullable=True))

    op.create_table(
        "fiscal_periods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("period_key", sa.String(length=7), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["closed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_end"),
        sa.UniqueConstraint("period_start"),
    )
    op.create_index(op.f("ix_fiscal_periods_id"), "fiscal_periods", ["id"], unique=False)
    op.create_index(op.f("ix_fiscal_periods_period_key"), "fiscal_periods", ["period_key"], unique=True)

    op.add_column("journal_entries", sa.Column("period_id", sa.Integer(), nullable=True))
    op.add_column("journal_entries", sa.Column("reverses_entry_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_journal_entries_period_id"), "journal_entries", ["period_id"], unique=False)
    op.create_index(op.f("ix_journal_entries_reverses_entry_id"), "journal_entries", ["reverses_entry_id"], unique=False)
    op.create_foreign_key(
        "fk_journal_entries_period_id",
        "journal_entries",
        "fiscal_periods",
        ["period_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_journal_entries_reverses_entry_id",
        "journal_entries",
        "journal_entries",
        ["reverses_entry_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "ar_open_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("document_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("currency_code", sa.String(length=8), nullable=False),
        sa.Column("amount_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("amount_open", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["customer_id"], ["customer_profiles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ar_open_items_branch_id"), "ar_open_items", ["branch_id"], unique=False)
    op.create_index(op.f("ix_ar_open_items_customer_id"), "ar_open_items", ["customer_id"], unique=False)
    op.create_index(op.f("ix_ar_open_items_due_date"), "ar_open_items", ["due_date"], unique=False)
    op.create_index(op.f("ix_ar_open_items_id"), "ar_open_items", ["id"], unique=False)
    op.create_index(op.f("ix_ar_open_items_source_id"), "ar_open_items", ["source_id"], unique=False)
    op.create_index(op.f("ix_ar_open_items_source_type"), "ar_open_items", ["source_type"], unique=False)

    op.create_table(
        "ap_open_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("document_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("currency_code", sa.String(length=8), nullable=False),
        sa.Column("amount_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("amount_open", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ap_open_items_branch_id"), "ap_open_items", ["branch_id"], unique=False)
    op.create_index(op.f("ix_ap_open_items_due_date"), "ap_open_items", ["due_date"], unique=False)
    op.create_index(op.f("ix_ap_open_items_id"), "ap_open_items", ["id"], unique=False)
    op.create_index(op.f("ix_ap_open_items_source_id"), "ap_open_items", ["source_id"], unique=False)
    op.create_index(op.f("ix_ap_open_items_source_type"), "ap_open_items", ["source_type"], unique=False)
    op.create_index(op.f("ix_ap_open_items_supplier_id"), "ap_open_items", ["supplier_id"], unique=False)

    op.create_table(
        "ar_payment_applications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ar_open_item_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["ar_open_item_id"], ["ar_open_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ar_payment_applications_ar_open_item_id"), "ar_payment_applications", ["ar_open_item_id"], unique=False)
    op.create_index(op.f("ix_ar_payment_applications_id"), "ar_payment_applications", ["id"], unique=False)

    op.create_table(
        "ap_payment_applications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ap_open_item_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["ap_open_item_id"], ["ap_open_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ap_payment_applications_ap_open_item_id"), "ap_payment_applications", ["ap_open_item_id"], unique=False)
    op.create_index(op.f("ix_ap_payment_applications_id"), "ap_payment_applications", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ap_payment_applications_id"), table_name="ap_payment_applications")
    op.drop_index(op.f("ix_ap_payment_applications_ap_open_item_id"), table_name="ap_payment_applications")
    op.drop_table("ap_payment_applications")

    op.drop_index(op.f("ix_ar_payment_applications_id"), table_name="ar_payment_applications")
    op.drop_index(op.f("ix_ar_payment_applications_ar_open_item_id"), table_name="ar_payment_applications")
    op.drop_table("ar_payment_applications")

    op.drop_index(op.f("ix_ap_open_items_supplier_id"), table_name="ap_open_items")
    op.drop_index(op.f("ix_ap_open_items_source_type"), table_name="ap_open_items")
    op.drop_index(op.f("ix_ap_open_items_source_id"), table_name="ap_open_items")
    op.drop_index(op.f("ix_ap_open_items_id"), table_name="ap_open_items")
    op.drop_index(op.f("ix_ap_open_items_due_date"), table_name="ap_open_items")
    op.drop_index(op.f("ix_ap_open_items_branch_id"), table_name="ap_open_items")
    op.drop_table("ap_open_items")

    op.drop_index(op.f("ix_ar_open_items_source_type"), table_name="ar_open_items")
    op.drop_index(op.f("ix_ar_open_items_source_id"), table_name="ar_open_items")
    op.drop_index(op.f("ix_ar_open_items_id"), table_name="ar_open_items")
    op.drop_index(op.f("ix_ar_open_items_due_date"), table_name="ar_open_items")
    op.drop_index(op.f("ix_ar_open_items_customer_id"), table_name="ar_open_items")
    op.drop_index(op.f("ix_ar_open_items_branch_id"), table_name="ar_open_items")
    op.drop_table("ar_open_items")

    op.drop_constraint("fk_journal_entries_reverses_entry_id", "journal_entries", type_="foreignkey")
    op.drop_constraint("fk_journal_entries_period_id", "journal_entries", type_="foreignkey")
    op.drop_index(op.f("ix_journal_entries_reverses_entry_id"), table_name="journal_entries")
    op.drop_index(op.f("ix_journal_entries_period_id"), table_name="journal_entries")
    op.drop_column("journal_entries", "reverses_entry_id")
    op.drop_column("journal_entries", "period_id")

    op.drop_index(op.f("ix_fiscal_periods_period_key"), table_name="fiscal_periods")
    op.drop_index(op.f("ix_fiscal_periods_id"), table_name="fiscal_periods")
    op.drop_table("fiscal_periods")

    op.drop_column("payment_receipts", "card_last4")

    op.drop_index(op.f("ix_user_permission_overrides_user_id"), table_name="user_permission_overrides")
    op.drop_index(op.f("ix_user_permission_overrides_permission_id"), table_name="user_permission_overrides")
    op.drop_index(op.f("ix_user_permission_overrides_id"), table_name="user_permission_overrides")
    op.drop_index(op.f("ix_user_permission_overrides_branch_id"), table_name="user_permission_overrides")
    op.drop_table("user_permission_overrides")

    op.drop_index(op.f("ix_user_onboardings_user_id"), table_name="user_onboardings")
    op.drop_index(op.f("ix_user_onboardings_id"), table_name="user_onboardings")
    op.drop_index(op.f("ix_user_onboardings_assigned_hr_user_id"), table_name="user_onboardings")
    op.drop_table("user_onboardings")

    op.drop_index(op.f("ix_roles_code"), table_name="roles")
    op.drop_column("roles", "code")
