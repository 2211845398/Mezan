"""Make purchase_order_lines.unit_cost nullable (cost captured at goods receipt).

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "purchase_order_lines",
        "unit_cost",
        existing_type=sa.Numeric(precision=14, scale=4),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "purchase_order_lines",
        "unit_cost",
        existing_type=sa.Numeric(precision=14, scale=4),
        nullable=False,
    )
