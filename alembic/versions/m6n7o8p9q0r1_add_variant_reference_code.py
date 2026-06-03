"""Add product_variants.reference_code for merchant item tracking.

Revision ID: m6n7o8p9q0r1
Revises: l5m6n7o8p9q0
Create Date: 2026-05-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "m6n7o8p9q0r1"
down_revision: str | None = "l5m6n7o8p9q0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "product_variants",
        sa.Column("reference_code", sa.String(length=128), nullable=True),
    )
    op.create_index(
        "ix_product_variants_reference_code",
        "product_variants",
        ["reference_code"],
        unique=True,
        postgresql_where=sa.text("reference_code IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_product_variants_reference_code", table_name="product_variants")
    op.drop_column("product_variants", "reference_code")
