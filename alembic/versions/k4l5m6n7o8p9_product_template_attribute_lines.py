"""Product template attribute lines, variant combination_key and price_extra.

Revision ID: k4l5m6n7o8p9
Revises: j3k4l5m6n7o8
Create Date: 2026-05-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "k4l5m6n7o8p9"
down_revision: str | None = "j3k4l5m6n7o8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_attribute_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("attribute_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["attribute_id"], ["attributes.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "product_id",
            "attribute_id",
            name="uq_product_attribute_lines_product_attr",
        ),
    )
    op.create_index(
        op.f("ix_product_attribute_lines_product_id"),
        "product_attribute_lines",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_product_attribute_lines_attribute_id"),
        "product_attribute_lines",
        ["attribute_id"],
        unique=False,
    )

    op.create_table(
        "product_attribute_line_values",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=False),
        sa.Column("attribute_value_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["attribute_value_id"], ["attribute_values.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["line_id"], ["product_attribute_lines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "line_id",
            "attribute_value_id",
            name="uq_product_attribute_line_values_line_value",
        ),
    )
    op.create_index(
        op.f("ix_product_attribute_line_values_line_id"),
        "product_attribute_line_values",
        ["line_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_product_attribute_line_values_attribute_value_id"),
        "product_attribute_line_values",
        ["attribute_value_id"],
        unique=False,
    )

    op.add_column(
        "product_variants",
        sa.Column(
            "combination_key", sa.String(length=512), nullable=False, server_default="_default"
        ),
    )
    op.add_column(
        "product_variants",
        sa.Column(
            "price_extra", sa.Numeric(precision=14, scale=4), nullable=False, server_default="0"
        ),
    )
    op.create_index(
        op.f("ix_product_variants_combination_key"),
        "product_variants",
        ["combination_key"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_product_variants_product_combination",
        "product_variants",
        ["product_id", "combination_key"],
    )

    # Backfill combination_key from pivot rows
    op.execute(
        """
        UPDATE product_variants pv
        SET combination_key = COALESCE(
            (
                SELECT string_agg(pva.attribute_value_id::text, ',' ORDER BY pva.attribute_value_id)
                FROM product_variant_attributes pva
                WHERE pva.variant_id = pv.id
            ),
            CASE
                WHEN pv.attribute_values ? '_default' THEN '_default'
                ELSE '_default'
            END
        )
        """
    )

    # Backfill product_attribute_lines from existing variant pivots
    op.execute(
        """
        INSERT INTO product_attribute_lines (product_id, attribute_id, sort_order, created_at, updated_at)
        SELECT DISTINCT pv.product_id, pva.attribute_id, ca.sort_order, NOW(), NOW()
        FROM product_variant_attributes pva
        JOIN product_variants pv ON pv.id = pva.variant_id
        JOIN attributes ca ON ca.id = pva.attribute_id
        ON CONFLICT (product_id, attribute_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO product_attribute_line_values (line_id, attribute_value_id, created_at)
        SELECT pal.id, pva.attribute_value_id, NOW()
        FROM product_variant_attributes pva
        JOIN product_variants pv ON pv.id = pva.variant_id
        JOIN product_attribute_lines pal
          ON pal.product_id = pv.product_id AND pal.attribute_id = pva.attribute_id
        ON CONFLICT (line_id, attribute_value_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_product_variants_product_combination", "product_variants", type_="unique"
    )
    op.drop_index(op.f("ix_product_variants_combination_key"), table_name="product_variants")
    op.drop_column("product_variants", "price_extra")
    op.drop_column("product_variants", "combination_key")
    op.drop_table("product_attribute_line_values")
    op.drop_table("product_attribute_lines")
