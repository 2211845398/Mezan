"""Catalog: category images, product image, product category tags.

Revision ID: b2f8a1c3d4e5
Revises: a61dbc21ddfd
Create Date: 2026-05-05

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b2f8a1c3d4e5"
down_revision: Union[str, None] = "a61dbc21ddfd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("image_url", sa.String(length=1024), nullable=True))
    op.add_column("products", sa.Column("image_url", sa.String(length=1024), nullable=True))

    op.create_table(
        "product_categories",
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_categories_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_product_categories_category_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("product_id", "category_id", name=op.f("pk_product_categories")),
    )
    op.create_index(
        op.f("ix_product_categories_category_id"),
        "product_categories",
        ["category_id"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO product_categories (product_id, category_id)
        SELECT id, category_id FROM products
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_product_categories_category_id"), table_name="product_categories")
    op.drop_table("product_categories")
    op.drop_column("products", "image_url")
    op.drop_column("categories", "image_url")
