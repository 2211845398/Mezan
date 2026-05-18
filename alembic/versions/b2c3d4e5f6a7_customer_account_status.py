"""Add account_status to customer_profiles (active / pending_activation / suspended).

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f7
Create Date: 2026-05-18

Backfill:
- is_active true -> active
- is_active false and is_temporary true -> pending_activation
- is_active false and is_temporary false -> suspended

Then sync is_active to (account_status = 'active').
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "customer_profiles",
        sa.Column(
            "account_status",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE customer_profiles
            SET account_status = CASE
                WHEN is_active THEN 'active'
                WHEN is_temporary THEN 'pending_activation'
                ELSE 'suspended'
            END
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE customer_profiles
            SET is_active = (account_status = 'active')
            """
        )
    )
    op.alter_column("customer_profiles", "account_status", server_default=None)


def downgrade() -> None:
    op.drop_column("customer_profiles", "account_status")
