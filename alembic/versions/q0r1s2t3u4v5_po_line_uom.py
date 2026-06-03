"""Add uom_id and qty_base to purchase_order_lines.

Revision ID: q0r1s2t3u4v5
Revises: p9q0r1s2t3u4
Create Date: 2026-05-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "q0r1s2t3u4v5"
down_revision: str | None = "p9q0r1s2t3u4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "purchase_order_lines",
        sa.Column("uom_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "purchase_order_lines",
        sa.Column("qty_base", sa.Integer(), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE purchase_order_lines pol
            SET uom_id = p.uom_id,
                qty_base = pol.qty
            FROM products p
            WHERE p.id = pol.product_id
            """
        )
    )
    op.alter_column("purchase_order_lines", "uom_id", nullable=False)
    op.alter_column("purchase_order_lines", "qty_base", nullable=False)
    op.create_foreign_key(
        "fk_purchase_order_lines_uom_id",
        "purchase_order_lines",
        "units_of_measure",
        ["uom_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_purchase_order_lines_uom_id", "purchase_order_lines", ["uom_id"])


def downgrade() -> None:
    op.drop_index("ix_purchase_order_lines_uom_id", table_name="purchase_order_lines")
    op.drop_constraint("fk_purchase_order_lines_uom_id", "purchase_order_lines", type_="foreignkey")
    op.drop_column("purchase_order_lines", "qty_base")
    op.drop_column("purchase_order_lines", "uom_id")
