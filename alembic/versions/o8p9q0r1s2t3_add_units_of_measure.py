"""Add units_of_measure and products.uom_id.

Revision ID: o8p9q0r1s2t3
Revises: n7o8p9q0r1s2
Create Date: 2026-05-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o8p9q0r1s2t3"
down_revision: Union[str, None] = "n7o8p9q0r1s2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_UOMS = [
    ("PIECE", "Piece", "pcs"),
    ("BOX", "Box", "box"),
    ("KG", "Kilogram", "kg"),
    ("METER", "Meter", "m"),
]


def upgrade() -> None:
    op.create_table(
        "units_of_measure",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_units_of_measure_code"),
    )
    op.create_index("ix_units_of_measure_code", "units_of_measure", ["code"], unique=True)

    uom = sa.table(
        "units_of_measure",
        sa.column("id", sa.Integer),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("symbol", sa.String),
    )
    op.bulk_insert(
        uom,
        [{"id": i + 1, "code": c, "name": n, "symbol": s} for i, (c, n, s) in enumerate(DEFAULT_UOMS)],
    )

    op.add_column("products", sa.Column("uom_id", sa.Integer(), nullable=True))
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE products SET uom_id = (SELECT id FROM units_of_measure WHERE code = 'PIECE' LIMIT 1)")
    )
    op.alter_column("products", "uom_id", nullable=False)
    op.create_foreign_key(
        "fk_products_uom_id",
        "products",
        "units_of_measure",
        ["uom_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_products_uom_id", "products", ["uom_id"])


def downgrade() -> None:
    op.drop_index("ix_products_uom_id", table_name="products")
    op.drop_constraint("fk_products_uom_id", "products", type_="foreignkey")
    op.drop_column("products", "uom_id")
    op.drop_index("ix_units_of_measure_code", table_name="units_of_measure")
    op.drop_table("units_of_measure")
