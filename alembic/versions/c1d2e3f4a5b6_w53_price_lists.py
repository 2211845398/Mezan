"""W-5.3 price lists: named lists, branch scope, per-product unit prices.

Revision ID: c1d2e3f4a5b6
Revises: 305898f5e49b
Create Date: 2026-04-22

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "305898f5e49b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "price_lists",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_price_lists_id"), "price_lists", ["id"], unique=False)
    op.create_index(
        "ix_price_lists_effective_from", "price_lists", ["effective_from"], unique=False
    )
    op.create_index("ix_price_lists_effective_to", "price_lists", ["effective_to"], unique=False)

    op.create_table(
        "price_list_branches",
        sa.Column("price_list_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["price_list_id"], ["price_lists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("price_list_id", "branch_id", name="pk_price_list_branches"),
    )
    op.create_index(
        op.f("ix_price_list_branches_price_list_id"),
        "price_list_branches",
        ["price_list_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_price_list_branches_branch_id"), "price_list_branches", ["branch_id"], unique=False
    )

    op.create_table(
        "price_list_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("price_list_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["currency_id"], ["currencies.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["price_list_id"], ["price_lists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("price_list_id", "product_id", name="uq_price_list_lines_list_product"),
    )
    op.create_index(op.f("ix_price_list_lines_id"), "price_list_lines", ["id"], unique=False)
    op.create_index(
        op.f("ix_price_list_lines_price_list_id"),
        "price_list_lines",
        ["price_list_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_price_list_lines_product_id"), "price_list_lines", ["product_id"], unique=False
    )
    op.create_index(
        op.f("ix_price_list_lines_currency_id"), "price_list_lines", ["currency_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_price_list_lines_currency_id"), table_name="price_list_lines")
    op.drop_index(op.f("ix_price_list_lines_product_id"), table_name="price_list_lines")
    op.drop_index(op.f("ix_price_list_lines_price_list_id"), table_name="price_list_lines")
    op.drop_index(op.f("ix_price_list_lines_id"), table_name="price_list_lines")
    op.drop_table("price_list_lines")
    op.drop_index(op.f("ix_price_list_branches_branch_id"), table_name="price_list_branches")
    op.drop_index(op.f("ix_price_list_branches_price_list_id"), table_name="price_list_branches")
    op.drop_table("price_list_branches")
    op.drop_index("ix_price_lists_effective_to", table_name="price_lists")
    op.drop_index("ix_price_lists_effective_from", table_name="price_lists")
    op.drop_index(op.f("ix_price_lists_id"), table_name="price_lists")
    op.drop_table("price_lists")
