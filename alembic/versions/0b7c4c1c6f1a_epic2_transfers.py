"""epic2_transfers

Revision ID: 0b7c4c1c6f1a
Revises: 9c1db2d8f0e2
Create Date: 2026-03-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0b7c4c1c6f1a"
down_revision: str | None = "9c1db2d8f0e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transfer_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("from_branch_id", sa.Integer(), nullable=False),
        sa.Column("to_branch_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending_dispatch"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
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
            ["from_branch_id"],
            ["branches.id"],
            name="fk_transfer_batches_from_branch_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["to_branch_id"],
            ["branches.id"],
            name="fk_transfer_batches_to_branch_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_transfer_batches_created_by_user_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_transfer_batches_id", "transfer_batches", ["id"])
    op.create_index("ix_transfer_batches_from_branch_id", "transfer_batches", ["from_branch_id"])
    op.create_index("ix_transfer_batches_to_branch_id", "transfer_batches", ["to_branch_id"])
    op.create_index(
        "ix_transfer_batches_created_by_user_id", "transfer_batches", ["created_by_user_id"]
    )

    op.create_table(
        "transfer_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transfer_batch_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["transfer_batch_id"],
            ["transfer_batches.id"],
            name="fk_transfer_lines_transfer_batch_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_transfer_lines_product_id",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_transfer_lines_id", "transfer_lines", ["id"])
    op.create_index("ix_transfer_lines_transfer_batch_id", "transfer_lines", ["transfer_batch_id"])
    op.create_index("ix_transfer_lines_product_id", "transfer_lines", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_transfer_lines_product_id", table_name="transfer_lines")
    op.drop_index("ix_transfer_lines_transfer_batch_id", table_name="transfer_lines")
    op.drop_index("ix_transfer_lines_id", table_name="transfer_lines")
    op.drop_table("transfer_lines")

    op.drop_index("ix_transfer_batches_created_by_user_id", table_name="transfer_batches")
    op.drop_index("ix_transfer_batches_to_branch_id", table_name="transfer_batches")
    op.drop_index("ix_transfer_batches_from_branch_id", table_name="transfer_batches")
    op.drop_index("ix_transfer_batches_id", table_name="transfer_batches")
    op.drop_table("transfer_batches")

