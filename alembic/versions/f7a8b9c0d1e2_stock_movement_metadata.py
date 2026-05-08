"""stock_movements: movement_kind, notes, user_id, reserved_delta, damaged_delta

Revision ID: f7a8b9c0d1e2
Revises: e1f2a3b4c5d6
Create Date: 2026-05-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stock_movements", sa.Column("movement_kind", sa.String(length=48), nullable=True))
    op.add_column("stock_movements", sa.Column("notes", sa.String(length=1024), nullable=True))
    op.add_column(
        "stock_movements",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    op.add_column("stock_movements", sa.Column("reserved_delta", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("damaged_delta", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_stock_movements_user_id_users",
        "stock_movements",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_stock_movements_user_id_users", "stock_movements", type_="foreignkey")
    op.drop_column("stock_movements", "damaged_delta")
    op.drop_column("stock_movements", "reserved_delta")
    op.drop_column("stock_movements", "user_id")
    op.drop_column("stock_movements", "notes")
    op.drop_column("stock_movements", "movement_kind")
