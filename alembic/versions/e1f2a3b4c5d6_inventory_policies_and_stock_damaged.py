"""inventory_policies table + stock_levels.damaged

Revision ID: e1f2a3b4c5d6
Revises: d4f8a1c2b3e4
Create Date: 2026-05-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d4f8a1c2b3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock_levels",
        sa.Column("damaged", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "inventory_policies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("reorder_point", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reorder_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("preferred_supplier_id", sa.Integer(), nullable=True),
        sa.Column("lead_time_days", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["preferred_supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("branch_id", "product_id", name="uq_inventory_policies_branch_product"),
    )
    op.create_index(op.f("ix_inventory_policies_branch_id"), "inventory_policies", ["branch_id"], unique=False)
    op.create_index(op.f("ix_inventory_policies_product_id"), "inventory_policies", ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_inventory_policies_product_id"), table_name="inventory_policies")
    op.drop_index(op.f("ix_inventory_policies_branch_id"), table_name="inventory_policies")
    op.drop_table("inventory_policies")
    op.drop_column("stock_levels", "damaged")
