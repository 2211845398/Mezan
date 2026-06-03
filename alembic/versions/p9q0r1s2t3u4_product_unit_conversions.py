"""Add measurement_category and product_unit_conversions.

Revision ID: p9q0r1s2t3u4
Revises: o8p9q0r1s2t3
Create Date: 2026-05-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "p9q0r1s2t3u4"
down_revision: str | None = "o8p9q0r1s2t3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UOM_CATEGORIES = {
    "PIECE": "discrete",
    "BOX": "discrete",
    "KG": "weight",
    "METER": "length",
}


def upgrade() -> None:
    op.add_column(
        "units_of_measure",
        sa.Column(
            "measurement_category",
            sa.String(length=32),
            nullable=False,
            server_default="discrete",
        ),
    )
    conn = op.get_bind()
    for code, category in UOM_CATEGORIES.items():
        conn.execute(
            sa.text("UPDATE units_of_measure SET measurement_category = :cat WHERE code = :code"),
            {"cat": category, "code": code},
        )
    op.alter_column("units_of_measure", "measurement_category", server_default=None)

    op.create_table(
        "product_unit_conversions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("uom_id", sa.Integer(), nullable=False),
        sa.Column("factor_to_base", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uom_id"], ["units_of_measure.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "product_id",
            "uom_id",
            name="uq_product_unit_conversions_product_uom",
        ),
    )
    op.create_index(
        "ix_product_unit_conversions_product_id",
        "product_unit_conversions",
        ["product_id"],
    )
    op.create_index(
        "ix_product_unit_conversions_uom_id",
        "product_unit_conversions",
        ["uom_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_product_unit_conversions_uom_id", table_name="product_unit_conversions")
    op.drop_index(
        "ix_product_unit_conversions_product_id",
        table_name="product_unit_conversions",
    )
    op.drop_table("product_unit_conversions")
    op.drop_column("units_of_measure", "measurement_category")
