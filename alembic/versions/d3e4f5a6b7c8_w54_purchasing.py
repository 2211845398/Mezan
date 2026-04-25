"""W-5.4 purchasing: PO branch + send idempotency, goods receipt PO link, supplier fields.

Revision ID: d3e4f5a6b7c8
Revises: c1d2e3f4a5b6
Create Date: 2026-04-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d3e4f5a6b7c8"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "purchase_orders",
        sa.Column("branch_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_purchase_orders_branch_id",
        "purchase_orders",
        "branches",
        ["branch_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_purchase_orders_branch_id"),
        "purchase_orders",
        ["branch_id"],
        unique=False,
    )
    op.add_column(
        "purchase_orders",
        sa.Column("send_idempotency_key", sa.String(length=128), nullable=True),
    )
    op.create_index(
        op.f("ix_purchase_orders_send_idempotency_key"),
        "purchase_orders",
        ["send_idempotency_key"],
        unique=False,
    )

    op.add_column(
        "goods_receipts",
        sa.Column("purchase_order_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_goods_receipts_purchase_order_id",
        "goods_receipts",
        "purchase_orders",
        ["purchase_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_goods_receipts_purchase_order_id"),
        "goods_receipts",
        ["purchase_order_id"],
        unique=False,
    )
    op.add_column(
        "goods_receipts",
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
    )
    op.create_index(
        op.f("ix_goods_receipts_idempotency_key"),
        "goods_receipts",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    op.add_column(
        "goods_receipt_lines",
        sa.Column("purchase_order_line_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_goods_receipt_lines_purchase_order_line_id",
        "goods_receipt_lines",
        "purchase_order_lines",
        ["purchase_order_line_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_goods_receipt_lines_purchase_order_line_id"),
        "goods_receipt_lines",
        ["purchase_order_line_id"],
        unique=False,
    )

    op.add_column(
        "suppliers",
        sa.Column("tax_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "suppliers",
        sa.Column(
            "contact",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "suppliers",
        sa.Column("payment_terms", sa.String(length=512), nullable=True),
    )

    op.add_column(
        "invoice_scans",
        sa.Column("catalog_match_apply_idempotency_key", sa.String(length=128), nullable=True),
    )
    op.create_index(
        op.f("ix_invoice_scans_catalog_match_apply_idempotency_key"),
        "invoice_scans",
        ["catalog_match_apply_idempotency_key"],
        unique=True,
        postgresql_where=sa.text("catalog_match_apply_idempotency_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_invoice_scans_catalog_match_apply_idempotency_key"),
        table_name="invoice_scans",
        postgresql_where=sa.text("catalog_match_apply_idempotency_key IS NOT NULL"),
    )
    op.drop_column("invoice_scans", "catalog_match_apply_idempotency_key")

    op.drop_column("suppliers", "payment_terms")
    op.drop_column("suppliers", "contact")
    op.drop_column("suppliers", "tax_id")

    op.drop_index(
        op.f("ix_goods_receipt_lines_purchase_order_line_id"),
        table_name="goods_receipt_lines",
    )
    op.drop_constraint(
        "fk_goods_receipt_lines_purchase_order_line_id",
        "goods_receipt_lines",
        type_="foreignkey",
    )
    op.drop_column("goods_receipt_lines", "purchase_order_line_id")

    op.drop_index(
        op.f("ix_goods_receipts_idempotency_key"),
        table_name="goods_receipts",
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.drop_column("goods_receipts", "idempotency_key")
    op.drop_index(op.f("ix_goods_receipts_purchase_order_id"), table_name="goods_receipts")
    op.drop_constraint("fk_goods_receipts_purchase_order_id", "goods_receipts", type_="foreignkey")
    op.drop_column("goods_receipts", "purchase_order_id")

    op.drop_index(
        op.f("ix_purchase_orders_send_idempotency_key"),
        table_name="purchase_orders",
    )
    op.drop_column("purchase_orders", "send_idempotency_key")
    op.drop_index(op.f("ix_purchase_orders_branch_id"), table_name="purchase_orders")
    op.drop_constraint("fk_purchase_orders_branch_id", "purchase_orders", type_="foreignkey")
    op.drop_column("purchase_orders", "branch_id")
