"""notification read state

Revision ID: f9a8b7c6d5e4
Revises: e4f5a6b7c8d9
Create Date: 2026-05-01

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f9a8b7c6d5e4"
down_revision: str | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notification_deliveries",
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_notification_deliveries_user_read",
        "notification_deliveries",
        ["user_id", "read_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_deliveries_user_read",
        table_name="notification_deliveries",
    )
    op.drop_column("notification_deliveries", "read_at")
