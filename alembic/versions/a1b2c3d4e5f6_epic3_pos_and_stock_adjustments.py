"""epic3_pos_and_stock_adjustments

Revision ID: a1b2c3d4e5f6
Revises: 0b7c4c1c6f1a
Create Date: 2026-03-24
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "0b7c4c1c6f1a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pos_shifts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("terminal_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("opened_by_user_id", sa.Integer(), nullable=True),
        sa.Column("closed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("opening_float", sa.Numeric(12, 2), nullable=False),
        sa.Column("expected_cash", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("declared_cash", sa.Numeric(12, 2), nullable=True),
        sa.Column("variance", sa.Numeric(12, 2), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["terminal_id"], ["pos_terminals.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["opened_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["closed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("terminal_id", "status", name="uq_pos_shifts_terminal_status_open"),
    )
    op.create_index("ix_pos_shifts_id", "pos_shifts", ["id"])
    op.create_index("ix_pos_shifts_terminal_id", "pos_shifts", ["terminal_id"])
    op.create_index("ix_pos_shifts_branch_id", "pos_shifts", ["branch_id"])

    op.create_table(
        "pos_cash_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("shift_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["shift_id"], ["pos_shifts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_pos_cash_events_id", "pos_cash_events", ["id"])
    op.create_index("ix_pos_cash_events_shift_id", "pos_cash_events", ["shift_id"])

    op.create_table(
        "z_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("shift_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("report_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["shift_id"], ["pos_shifts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_z_reports_id", "z_reports", ["id"])

    op.create_table(
        "customer_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phone", sa.String(length=64), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("is_temporary", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_customer_profiles_id", "customer_profiles", ["id"])
    op.create_index("ix_customer_profiles_phone", "customer_profiles", ["phone"])

    op.create_table(
        "customer_onboarding_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["customer_id"], ["customer_profiles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_customer_onboarding_tokens_id", "customer_onboarding_tokens", ["id"])
    op.create_index(
        "ix_customer_onboarding_tokens_token_hash",
        "customer_onboarding_tokens",
        ["token_hash"],
    )

    op.create_table(
        "pos_carts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("terminal_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("shift_id", sa.Integer(), nullable=True),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("discount_total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["terminal_id"], ["pos_terminals.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["shift_id"], ["pos_shifts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["customer_id"], ["customer_profiles.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_pos_carts_id", "pos_carts", ["id"])
    op.create_index("ix_pos_carts_terminal_id", "pos_carts", ["terminal_id"])
    op.create_index("ix_pos_carts_status", "pos_carts", ["status"])

    op.create_table(
        "pos_cart_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["cart_id"], ["pos_carts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_pos_cart_lines_id", "pos_cart_lines", ["id"])
    op.create_index("ix_pos_cart_lines_cart_id", "pos_cart_lines", ["cart_id"])
    op.create_index("ix_pos_cart_lines_product_id", "pos_cart_lines", ["product_id"])

    op.create_table(
        "pos_cart_discounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["cart_id"], ["pos_carts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_pos_cart_discounts_id", "pos_cart_discounts", ["id"])
    op.create_index("ix_pos_cart_discounts_cart_id", "pos_cart_discounts", ["cart_id"])

    op.create_table(
        "pos_cart_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["cart_id"], ["pos_carts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_pos_cart_events_id", "pos_cart_events", ["id"])
    op.create_index("ix_pos_cart_events_cart_id", "pos_cart_events", ["cart_id"])

    op.create_table(
        "payment_intents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="requires_payment"),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["cart_id"], ["pos_carts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("cart_id", "status", name="uq_payment_intents_cart_status"),
    )
    op.create_index("ix_payment_intents_id", "payment_intents", ["id"])
    op.create_index("ix_payment_intents_cart_id", "payment_intents", ["cart_id"])
    op.create_index("ix_payment_intents_external_id", "payment_intents", ["external_id"])

    op.create_table(
        "payment_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("payment_intent_id", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False, unique=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["payment_intent_id"], ["payment_intents.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_payment_attempts_id", "payment_attempts", ["id"])
    op.create_index("ix_payment_attempts_payment_intent_id", "payment_attempts", ["payment_intent_id"])
    op.create_index("ix_payment_attempts_idempotency_key", "payment_attempts", ["idempotency_key"])

    op.create_table(
        "payment_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("payment_intent_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("redacted_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["payment_intent_id"], ["payment_intents.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_payment_receipts_id", "payment_receipts", ["id"])
    op.create_index("ix_payment_receipts_payment_intent_id", "payment_receipts", ["payment_intent_id"])

    op.create_table(
        "sales_invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_number", sa.String(length=64), nullable=False, unique=True),
        sa.Column("invoice_barcode", sa.String(length=128), nullable=False, unique=True),
        sa.Column("cart_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("terminal_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("discount_total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["cart_id"], ["pos_carts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["terminal_id"], ["pos_terminals.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["customer_id"], ["customer_profiles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_sales_invoices_id", "sales_invoices", ["id"])
    op.create_index("ix_sales_invoices_invoice_number", "sales_invoices", ["invoice_number"])
    op.create_index("ix_sales_invoices_invoice_barcode", "sales_invoices", ["invoice_barcode"])

    op.create_table(
        "sales_invoice_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_invoice_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["sales_invoice_id"], ["sales_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_sales_invoice_lines_id", "sales_invoice_lines", ["id"])
    op.create_index("ix_sales_invoice_lines_sales_invoice_id", "sales_invoice_lines", ["sales_invoice_id"])

    op.create_table(
        "invoice_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_invoice_id", sa.Integer(), nullable=False),
        sa.Column("payment_intent_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["sales_invoice_id"], ["sales_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_intent_id"], ["payment_intents.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_invoice_payments_id", "invoice_payments", ["id"])

    op.create_table(
        "sales_returns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_invoice_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="processed"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["sales_invoice_id"], ["sales_invoices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_sales_returns_id", "sales_returns", ["id"])

    op.create_table(
        "sales_return_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_return_id", sa.Integer(), nullable=False),
        sa.Column("sales_invoice_line_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("refund_amount", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["sales_return_id"], ["sales_returns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sales_invoice_line_id"], ["sales_invoice_lines.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_sales_return_lines_id", "sales_return_lines", ["id"])

    op.create_table(
        "credit_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_return_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("credit_number", sa.String(length=64), nullable=False, unique=True),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["sales_return_id"], ["sales_returns.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_credit_notes_id", "credit_notes", ["id"])

    op.create_table(
        "exchange_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_return_id", sa.Integer(), nullable=False),
        sa.Column("new_cart_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["sales_return_id"], ["sales_returns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["new_cart_id"], ["pos_carts.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_exchange_links_id", "exchange_links", ["id"])


def downgrade() -> None:
    for table in [
        "exchange_links",
        "credit_notes",
        "sales_return_lines",
        "sales_returns",
        "invoice_payments",
        "sales_invoice_lines",
        "sales_invoices",
        "payment_receipts",
        "payment_attempts",
        "payment_intents",
        "pos_cart_events",
        "pos_cart_discounts",
        "pos_cart_lines",
        "pos_carts",
        "customer_onboarding_tokens",
        "customer_profiles",
        "z_reports",
        "pos_cash_events",
        "pos_shifts",
    ]:
        op.drop_table(table)
