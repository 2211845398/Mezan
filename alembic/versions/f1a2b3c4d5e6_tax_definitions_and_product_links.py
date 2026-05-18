"""Add tax_definitions and product_tax_definitions for multi-tax products.

Revision ID: f1a2b3c4d5e6
Revises: e7b3c4d5a6f1
Create Date: 2026-05-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e7b3c4d5a6f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tax_definitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=True),
        sa.Column("rate", sa.Numeric(8, 4), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_tax_definitions_code"),
    )
    op.create_index(op.f("ix_tax_definitions_code"), "tax_definitions", ["code"], unique=False)
    op.create_index(op.f("ix_tax_definitions_id"), "tax_definitions", ["id"], unique=False)

    op.create_table(
        "product_tax_definitions",
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("tax_definition_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tax_definition_id"], ["tax_definitions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("product_id", "tax_definition_id"),
    )
    op.create_index(
        "ix_product_tax_definitions_product_id",
        "product_tax_definitions",
        ["product_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_product_tax_definitions_product_id", table_name="product_tax_definitions")
    op.drop_table("product_tax_definitions")
    op.drop_index(op.f("ix_tax_definitions_id"), table_name="tax_definitions")
    op.drop_index(op.f("ix_tax_definitions_code"), table_name="tax_definitions")
    op.drop_table("tax_definitions")
