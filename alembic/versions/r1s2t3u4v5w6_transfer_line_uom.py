"""Add uom_id and qty_base to transfer_lines.

Revision ID: r1s2t3u4v5w6
Revises: q0r1s2t3u4v5
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r1s2t3u4v5w6"
down_revision: Union[str, None] = "q0r1s2t3u4v5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transfer_lines",
        sa.Column("uom_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "transfer_lines",
        sa.Column("qty_base", sa.Integer(), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE transfer_lines tl
            SET uom_id = p.uom_id,
                qty_base = tl.qty
            FROM products p
            WHERE p.id = tl.product_id
            """
        )
    )
    op.alter_column("transfer_lines", "uom_id", nullable=False)
    op.alter_column("transfer_lines", "qty_base", nullable=False)
    op.create_foreign_key(
        "fk_transfer_lines_uom_id",
        "transfer_lines",
        "units_of_measure",
        ["uom_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_transfer_lines_uom_id", "transfer_lines", ["uom_id"])


def downgrade() -> None:
    op.drop_index("ix_transfer_lines_uom_id", table_name="transfer_lines")
    op.drop_constraint("fk_transfer_lines_uom_id", "transfer_lines", type_="foreignkey")
    op.drop_column("transfer_lines", "qty_base")
    op.drop_column("transfer_lines", "uom_id")
