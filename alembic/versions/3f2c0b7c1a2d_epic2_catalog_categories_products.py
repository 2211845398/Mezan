"""epic2_catalog_categories_products

Revision ID: 3f2c0b7c1a2d
Revises: 288f4b15c635
Create Date: 2026-03-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "3f2c0b7c1a2d"
down_revision: str | None = "288f4b15c635"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
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
            ["parent_id"],
            ["categories.id"],
            name="fk_categories_parent_id",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("parent_id", "name", name="uq_categories_parent_name"),
    )
    op.create_index("ix_categories_id", "categories", ["id"])
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])
    op.create_index("ix_categories_slug", "categories", ["slug"])

    op.create_table(
        "category_attribute_defs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("validation", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
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
            ["category_id"],
            ["categories.id"],
            name="fk_cat_attr_defs_category_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("category_id", "key", name="uq_cat_attr_defs_category_key"),
    )
    op.create_index("ix_category_attribute_defs_id", "category_attribute_defs", ["id"])
    op.create_index(
        "ix_cat_attr_defs_category_id", "category_attribute_defs", ["category_id"]
    )

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sku", sa.String(length=128), nullable=False),
        sa.Column("barcode", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column(
            "attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
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
            ["category_id"],
            ["categories.id"],
            name="fk_products_category_id",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("sku", name="uq_products_sku"),
        sa.UniqueConstraint("barcode", name="uq_products_barcode"),
    )
    op.create_index("ix_products_id", "products", ["id"])
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_name", "products", ["name"])
    op.create_index("ix_products_sku", "products", ["sku"])
    op.create_index("ix_products_barcode", "products", ["barcode"])
    op.create_index(
        "ix_products_attributes_gin",
        "products",
        ["attributes"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_products_attributes_gin", table_name="products")
    op.drop_index("ix_products_barcode", table_name="products")
    op.drop_index("ix_products_sku", table_name="products")
    op.drop_index("ix_products_name", table_name="products")
    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_index("ix_products_id", table_name="products")
    op.drop_table("products")

    op.drop_index("ix_cat_attr_defs_category_id", table_name="category_attribute_defs")
    op.drop_index("ix_category_attribute_defs_id", table_name="category_attribute_defs")
    op.drop_table("category_attribute_defs")

    op.drop_index("ix_categories_slug", table_name="categories")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_index("ix_categories_id", table_name="categories")
    op.drop_table("categories")

