"""epic2_purchase_orders

Revision ID: 6a6c2d7a9e31
Revises: 3f2c0b7c1a2d
Create Date: 2026-03-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6a6c2d7a9e31"
down_revision: str | None = "3f2c0b7c1a2d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("supplier_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("notes", sa.String(length=1024), nullable=True),
        sa.Column("expected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
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
            ["created_by_user_id"],
            ["users.id"],
            name="fk_purchase_orders_created_by_user_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_purchase_orders_id", "purchase_orders", ["id"])
    op.create_index("ix_purchase_orders_supplier_name", "purchase_orders", ["supplier_name"])
    op.create_index("ix_purchase_orders_created_by_user_id", "purchase_orders", ["created_by_user_id"])

    op.create_table(
        "purchase_order_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("purchase_order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 4), nullable=False),
        sa.ForeignKeyConstraint(
            ["purchase_order_id"],
            ["purchase_orders.id"],
            name="fk_purchase_order_lines_purchase_order_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_purchase_order_lines_product_id",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_purchase_order_lines_id", "purchase_order_lines", ["id"])
    op.create_index(
        "ix_purchase_order_lines_purchase_order_id", "purchase_order_lines", ["purchase_order_id"]
    )
    op.create_index("ix_purchase_order_lines_product_id", "purchase_order_lines", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_purchase_order_lines_product_id", table_name="purchase_order_lines")
    op.drop_index(
        "ix_purchase_order_lines_purchase_order_id", table_name="purchase_order_lines"
    )
    op.drop_index("ix_purchase_order_lines_id", table_name="purchase_order_lines")
    op.drop_table("purchase_order_lines")

    op.drop_index("ix_purchase_orders_created_by_user_id", table_name="purchase_orders")
    op.drop_index("ix_purchase_orders_supplier_name", table_name="purchase_orders")
    op.drop_index("ix_purchase_orders_id", table_name="purchase_orders")
    op.drop_table("purchase_orders")

