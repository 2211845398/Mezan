"""epic2_goods_receipt_and_stock

Revision ID: 9c1db2d8f0e2
Revises: 7f1e9e0c8a44
Create Date: 2026-03-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c1db2d8f0e2"
down_revision: str | None = "7f1e9e0c8a44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stock_levels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("on_hand", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reserved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name="fk_stock_levels_branch_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_stock_levels_product_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("branch_id", "product_id", name="uq_stock_levels_branch_product"),
    )
    op.create_index("ix_stock_levels_id", "stock_levels", ["id"])
    op.create_index("ix_stock_levels_branch_id", "stock_levels", ["branch_id"])
    op.create_index("ix_stock_levels_product_id", "stock_levels", ["product_id"])

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty_delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("ref_type", sa.String(length=64), nullable=True),
        sa.Column("ref_id", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name="fk_stock_movements_branch_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_stock_movements_product_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("idempotency_key", name="uq_stock_movements_idempotency_key"),
    )
    op.create_index("ix_stock_movements_id", "stock_movements", ["id"])
    op.create_index("ix_stock_movements_branch_id", "stock_movements", ["branch_id"])
    op.create_index("ix_stock_movements_product_id", "stock_movements", ["product_id"])

    op.create_table(
        "goods_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("supplier_name", sa.String(length=255), nullable=True),
        sa.Column("invoice_number", sa.String(length=128), nullable=True),
        sa.Column("source_invoice_scan_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name="fk_goods_receipts_branch_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_invoice_scan_id"],
            ["invoice_scans.id"],
            name="fk_goods_receipts_source_invoice_scan_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_goods_receipts_created_by_user_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_goods_receipts_id", "goods_receipts", ["id"])
    op.create_index("ix_goods_receipts_branch_id", "goods_receipts", ["branch_id"])
    op.create_index("ix_goods_receipts_invoice_number", "goods_receipts", ["invoice_number"])
    op.create_index(
        "ix_goods_receipts_source_invoice_scan_id", "goods_receipts", ["source_invoice_scan_id"]
    )
    op.create_index(
        "ix_goods_receipts_created_by_user_id", "goods_receipts", ["created_by_user_id"]
    )

    op.create_table(
        "goods_receipt_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("goods_receipt_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 4), nullable=False),
        sa.ForeignKeyConstraint(
            ["goods_receipt_id"],
            ["goods_receipts.id"],
            name="fk_goods_receipt_lines_goods_receipt_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_goods_receipt_lines_product_id",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_goods_receipt_lines_id", "goods_receipt_lines", ["id"])
    op.create_index(
        "ix_goods_receipt_lines_goods_receipt_id",
        "goods_receipt_lines",
        ["goods_receipt_id"],
    )
    op.create_index("ix_goods_receipt_lines_product_id", "goods_receipt_lines", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_goods_receipt_lines_product_id", table_name="goods_receipt_lines")
    op.drop_index("ix_goods_receipt_lines_goods_receipt_id", table_name="goods_receipt_lines")
    op.drop_index("ix_goods_receipt_lines_id", table_name="goods_receipt_lines")
    op.drop_table("goods_receipt_lines")

    op.drop_index("ix_goods_receipts_created_by_user_id", table_name="goods_receipts")
    op.drop_index("ix_goods_receipts_source_invoice_scan_id", table_name="goods_receipts")
    op.drop_index("ix_goods_receipts_invoice_number", table_name="goods_receipts")
    op.drop_index("ix_goods_receipts_branch_id", table_name="goods_receipts")
    op.drop_index("ix_goods_receipts_id", table_name="goods_receipts")
    op.drop_table("goods_receipts")

    op.drop_index("ix_stock_movements_product_id", table_name="stock_movements")
    op.drop_index("ix_stock_movements_branch_id", table_name="stock_movements")
    op.drop_index("ix_stock_movements_id", table_name="stock_movements")
    op.drop_table("stock_movements")

    op.drop_index("ix_stock_levels_product_id", table_name="stock_levels")
    op.drop_index("ix_stock_levels_branch_id", table_name="stock_levels")
    op.drop_index("ix_stock_levels_id", table_name="stock_levels")
    op.drop_table("stock_levels")
