"""Hard remove category-bound product attributes.

Revision ID: l5m6n7o8p9q0
Revises: k4l5m6n7o8p9
Create Date: 2026-05-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "l5m6n7o8p9q0"
down_revision: str | None = "k4l5m6n7o8p9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("category_attribute_defs")
    op.drop_column("products", "attributes")


def downgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_table(
        "category_attribute_defs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("inherited_from_category_id", sa.Integer(), nullable=True),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("validation", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attribute_id", sa.Integer(), nullable=True),
        sa.Column(
            "use_for_variants", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["attribute_id"], ["attributes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["inherited_from_category_id"], ["categories.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("category_id", "key", name="uq_cat_attr_defs_category_key"),
    )
    op.create_index(
        op.f("ix_category_attribute_defs_attribute_id"),
        "category_attribute_defs",
        ["attribute_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_category_attribute_defs_category_id"),
        "category_attribute_defs",
        ["category_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_category_attribute_defs_inherited_from_category_id"),
        "category_attribute_defs",
        ["inherited_from_category_id"],
        unique=False,
    )
