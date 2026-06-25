"""fix_attendance_device_and_auth_lifecycle_indices

Revision ID: h4i5j6k7l8m9
Revises: g3h4i5j6k7l8
Create Date: 2026-06-25

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "h4i5j6k7l8m9"
down_revision: str | None = "g3h4i5j6k7l8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # attendance_devices: align unique indexes with ORM (drop legacy unique constraints)
    op.drop_index("ix_attendance_devices_device_code", table_name="attendance_devices")
    op.drop_index("ix_attendance_devices_user_id", table_name="attendance_devices")
    op.drop_constraint("attendance_devices_device_code_key", "attendance_devices", type_="unique")
    op.drop_constraint("attendance_devices_user_id_key", "attendance_devices", type_="unique")
    op.create_index(op.f("ix_attendance_devices_id"), "attendance_devices", ["id"], unique=False)
    op.create_index(
        op.f("ix_attendance_devices_device_code"),
        "attendance_devices",
        ["device_code"],
        unique=True,
    )
    op.create_index(
        op.f("ix_attendance_devices_user_id"), "attendance_devices", ["user_id"], unique=True
    )

    # two_factor_challenges: primary-key index + named unique constraint on token_hash
    op.create_index(
        op.f("ix_two_factor_challenges_id"), "two_factor_challenges", ["id"], unique=False
    )
    op.drop_constraint(
        "two_factor_challenges_token_hash_key", "two_factor_challenges", type_="unique"
    )
    op.create_unique_constraint(
        "uq_two_factor_challenges_token_hash", "two_factor_challenges", ["token_hash"]
    )

    # two_factor_otps: primary-key index
    op.create_index(op.f("ix_two_factor_otps_id"), "two_factor_otps", ["id"], unique=False)

    # correspondence_messages: primary-key index
    op.create_index(
        op.f("ix_correspondence_messages_id"), "correspondence_messages", ["id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_correspondence_messages_id"), table_name="correspondence_messages")

    op.drop_index(op.f("ix_two_factor_otps_id"), table_name="two_factor_otps")

    op.drop_constraint(
        "uq_two_factor_challenges_token_hash", "two_factor_challenges", type_="unique"
    )
    op.create_unique_constraint(
        "two_factor_challenges_token_hash_key", "two_factor_challenges", ["token_hash"]
    )
    op.drop_index(op.f("ix_two_factor_challenges_id"), table_name="two_factor_challenges")

    op.drop_index(op.f("ix_attendance_devices_user_id"), table_name="attendance_devices")
    op.drop_index(op.f("ix_attendance_devices_device_code"), table_name="attendance_devices")
    op.drop_index(op.f("ix_attendance_devices_id"), table_name="attendance_devices")
    op.create_unique_constraint("attendance_devices_user_id_key", "attendance_devices", ["user_id"])
    op.create_unique_constraint(
        "attendance_devices_device_code_key", "attendance_devices", ["device_code"]
    )
    op.create_index(
        "ix_attendance_devices_user_id", "attendance_devices", ["user_id"], unique=False
    )
    op.create_index(
        "ix_attendance_devices_device_code", "attendance_devices", ["device_code"], unique=False
    )
