"""Variant attribute pivot tables and category_attribute_defs links.

Revision ID: j3k4l5m6n7o8
Revises: i2j3k4l5m6n7
Create Date: 2026-05-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "j3k4l5m6n7o8"
down_revision: str | None = "i2j3k4l5m6n7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "attributes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_attributes_code"),
    )
    op.create_index(op.f("ix_attributes_code"), "attributes", ["code"], unique=True)

    op.create_table(
        "attribute_values",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attribute_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["attribute_id"],
            ["attributes.id"],
            name=op.f("fk_attribute_values_attribute_id_attributes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "attribute_id",
            "code",
            name="uq_attribute_values_attribute_code",
        ),
    )
    op.create_index(
        op.f("ix_attribute_values_attribute_id"),
        "attribute_values",
        ["attribute_id"],
        unique=False,
    )

    op.create_table(
        "product_variant_attributes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("attribute_id", sa.Integer(), nullable=False),
        sa.Column("attribute_value_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["attribute_id"],
            ["attributes.id"],
            name=op.f("fk_product_variant_attributes_attribute_id_attributes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["attribute_value_id"],
            ["attribute_values.id"],
            name=op.f("fk_product_variant_attributes_attribute_value_id_attribute_values"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["variant_id"],
            ["product_variants.id"],
            name=op.f("fk_product_variant_attributes_variant_id_product_variants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "variant_id",
            "attribute_id",
            name="uq_pva_variant_attribute",
        ),
    )
    op.create_index(
        op.f("ix_product_variant_attributes_variant_id"),
        "product_variant_attributes",
        ["variant_id"],
        unique=False,
    )
    op.create_index(
        "ix_pva_attribute_value_filter",
        "product_variant_attributes",
        ["attribute_id", "attribute_value_id"],
        unique=False,
    )

    op.add_column(
        "category_attribute_defs",
        sa.Column("attribute_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "category_attribute_defs",
        sa.Column(
            "use_for_variants",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_foreign_key(
        op.f("fk_category_attribute_defs_attribute_id_attributes"),
        "category_attribute_defs",
        "attributes",
        ["attribute_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_category_attribute_defs_attribute_id"),
        "category_attribute_defs",
        ["attribute_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_category_attribute_defs_attribute_id"),
        table_name="category_attribute_defs",
    )
    op.drop_constraint(
        op.f("fk_category_attribute_defs_attribute_id_attributes"),
        "category_attribute_defs",
        type_="foreignkey",
    )
    op.drop_column("category_attribute_defs", "use_for_variants")
    op.drop_column("category_attribute_defs", "attribute_id")

    op.drop_index("ix_pva_attribute_value_filter", table_name="product_variant_attributes")
    op.drop_index(
        op.f("ix_product_variant_attributes_variant_id"),
        table_name="product_variant_attributes",
    )
    op.drop_table("product_variant_attributes")
    op.drop_index(op.f("ix_attribute_values_attribute_id"), table_name="attribute_values")
    op.drop_table("attribute_values")
    op.drop_index(op.f("ix_attributes_code"), table_name="attributes")
    op.drop_table("attributes")
