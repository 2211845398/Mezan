"""Add uom_id to pos_cart_lines and variant_id to product_prices.

Revision ID: y0z1a2b3c4d5
Revises: x9y0z1a2b3c4
Create Date: 2026-06-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "y0z1a2b3c4d5"
down_revision: str | None = "x9y0z1a2b3c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("pos_cart_lines", sa.Column("uom_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_pos_cart_lines_uom_id_units_of_measure"),
        "pos_cart_lines",
        "units_of_measure",
        ["uom_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE pos_cart_lines pcl
            SET uom_id = p.uom_id
            FROM products p
            WHERE p.id = pcl.product_id AND pcl.uom_id IS NULL
            """
        )
    )
    op.alter_column("pos_cart_lines", "uom_id", nullable=False)

    op.add_column("product_prices", sa.Column("variant_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_product_prices_variant_id_product_variants"),
        "product_prices",
        "product_variants",
        ["variant_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_product_prices_variant_id"),
        "product_prices",
        ["variant_id"],
        unique=False,
    )
    op.drop_constraint("uq_product_prices_product_currency_valid_from", "product_prices", type_="unique")
    op.create_unique_constraint(
        "uq_product_prices_product_variant_currency_valid_from",
        "product_prices",
        ["product_id", "variant_id", "currency_id", "valid_from"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_product_prices_product_variant_currency_valid_from", "product_prices", type_="unique"
    )
    op.create_unique_constraint(
        "uq_product_prices_product_currency_valid_from",
        "product_prices",
        ["product_id", "currency_id", "valid_from"],
    )
    op.drop_index(op.f("ix_product_prices_variant_id"), table_name="product_prices")
    op.drop_constraint(
        op.f("fk_product_prices_variant_id_product_variants"), "product_prices", type_="foreignkey"
    )
    op.drop_column("product_prices", "variant_id")
    op.drop_constraint(
        op.f("fk_pos_cart_lines_uom_id_units_of_measure"), "pos_cart_lines", type_="foreignkey"
    )
    op.drop_column("pos_cart_lines", "uom_id")
