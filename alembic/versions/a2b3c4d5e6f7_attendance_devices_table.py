"""attendance_devices table

Revision ID: a2b3c4d5e6f7
Revises: z1a2b3c4d5e6
Create Date: 2026-06-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a2b3c4d5e6f7"
down_revision = "z1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attendance_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("device_code", sa.String(length=128), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("qr_token_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_code"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_attendance_devices_branch_id", "attendance_devices", ["branch_id"])
    op.create_index("ix_attendance_devices_user_id", "attendance_devices", ["user_id"])
    op.create_index("ix_attendance_devices_device_code", "attendance_devices", ["device_code"])


def downgrade() -> None:
    op.drop_index("ix_attendance_devices_device_code", table_name="attendance_devices")
    op.drop_index("ix_attendance_devices_user_id", table_name="attendance_devices")
    op.drop_index("ix_attendance_devices_branch_id", table_name="attendance_devices")
    op.drop_table("attendance_devices")
