"""Add owner_user_id to notification_schedules for user-private routines."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v7w8x9y0z1a2"
down_revision: Union[str, None] = "76cc97cdeddc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notification_schedules",
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_notification_schedules_owner_user_id",
        "notification_schedules",
        "users",
        ["owner_user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_notification_schedules_owner_user_id",
        "notification_schedules",
        ["owner_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_notification_schedules_owner_user_id", table_name="notification_schedules")
    op.drop_constraint(
        "fk_notification_schedules_owner_user_id",
        "notification_schedules",
        type_="foreignkey",
    )
    op.drop_column("notification_schedules", "owner_user_id")
