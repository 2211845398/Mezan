"""Stock count sessions and lines.

Revision ID: u1v2w3x4y5z6
Revises: t4u5v6w7x8y9
Create Date: 2026-05-25
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "u1v2w3x4y5z6"
down_revision: str | None = "t4u5v6w7x8y9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stock_count_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("product_ids_json", sa.Text(), nullable=True),
        sa.Column("responsible_name", sa.String(length=128), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "branch_id", "version_no", name="uq_stock_count_sessions_branch_version"
        ),
    )
    op.create_index("ix_stock_count_sessions_branch_id", "stock_count_sessions", ["branch_id"])

    op.create_table(
        "stock_count_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("variant_name", sa.String(length=255), nullable=False),
        sa.Column("reference_code", sa.String(length=64), nullable=False),
        sa.Column("system_on_hand", sa.Integer(), nullable=False),
        sa.Column("system_reserved", sa.Integer(), nullable=False),
        sa.Column("system_damaged", sa.Integer(), nullable=False),
        sa.Column("counted_qty", sa.Integer(), nullable=True),
        sa.Column("damaged_counted", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["stock_count_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id",
            "product_id",
            "variant_id",
            name="uq_stock_count_lines_session_product_variant",
        ),
    )
    op.create_index("ix_stock_count_lines_session_id", "stock_count_lines", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_count_lines_session_id", table_name="stock_count_lines")
    op.drop_table("stock_count_lines")
    op.drop_index("ix_stock_count_sessions_branch_id", table_name="stock_count_sessions")
    op.drop_table("stock_count_sessions")
