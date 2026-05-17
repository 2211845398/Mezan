"""Add is_active to customer_profiles for POS gating and manager activation.

Revision ID: c8e2f4a1b9d0
Revises: a293ac5bd46e
Create Date: 2026-05-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8e2f4a1b9d0"
down_revision: Union[str, None] = "a293ac5bd46e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "customer_profiles",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.execute(
        sa.text(
            "UPDATE customer_profiles SET is_active = false WHERE is_temporary = true"
        )
    )


def downgrade() -> None:
    op.drop_column("customer_profiles", "is_active")
