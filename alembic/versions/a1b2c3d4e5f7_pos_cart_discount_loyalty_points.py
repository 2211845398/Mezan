"""Add loyalty_points_redeemed to pos_cart_discounts for POS loyalty redemption.

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-05-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pos_cart_discounts",
        sa.Column("loyalty_points_redeemed", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pos_cart_discounts", "loyalty_points_redeemed")
