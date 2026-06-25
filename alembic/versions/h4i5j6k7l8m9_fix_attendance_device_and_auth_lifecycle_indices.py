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
    op.drop_index(
        "ix_attendance_devices_device_code", table_name="attendance_devices", if_exists=True
    )
    op.drop_index("ix_attendance_devices_user_id", table_name="attendance_devices", if_exists=True)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_devices_device_code_key') THEN
                ALTER TABLE attendance_devices DROP CONSTRAINT attendance_devices_device_code_key;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_devices_user_id_key') THEN
                ALTER TABLE attendance_devices DROP CONSTRAINT attendance_devices_user_id_key;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_attendance_devices_device_code') THEN
                ALTER TABLE attendance_devices DROP CONSTRAINT uq_attendance_devices_device_code;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_attendance_devices_user_id') THEN
                ALTER TABLE attendance_devices DROP CONSTRAINT uq_attendance_devices_user_id;
            END IF;
        END $$;
    """)
    op.create_index(
        op.f("ix_attendance_devices_id"),
        "attendance_devices",
        ["id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        op.f("ix_attendance_devices_device_code"),
        "attendance_devices",
        ["device_code"],
        unique=True,
        if_not_exists=True,
    )
    op.create_index(
        op.f("ix_attendance_devices_user_id"),
        "attendance_devices",
        ["user_id"],
        unique=True,
        if_not_exists=True,
    )

    # two_factor_challenges: primary-key index + named unique constraint on token_hash
    op.create_index(
        op.f("ix_two_factor_challenges_id"),
        "two_factor_challenges",
        ["id"],
        unique=False,
        if_not_exists=True,
    )
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'two_factor_challenges_token_hash_key'
            ) THEN
                ALTER TABLE two_factor_challenges
                    DROP CONSTRAINT two_factor_challenges_token_hash_key;
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_two_factor_challenges_token_hash'
            ) THEN
                ALTER TABLE two_factor_challenges
                    ADD CONSTRAINT uq_two_factor_challenges_token_hash UNIQUE (token_hash);
            END IF;
        END $$;
    """)

    # two_factor_otps: primary-key index
    op.create_index(
        op.f("ix_two_factor_otps_id"), "two_factor_otps", ["id"], unique=False, if_not_exists=True
    )

    # correspondence_messages: primary-key index
    op.create_index(
        op.f("ix_correspondence_messages_id"),
        "correspondence_messages",
        ["id"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_correspondence_messages_id"),
        table_name="correspondence_messages",
        if_exists=True,
    )

    op.drop_index(op.f("ix_two_factor_otps_id"), table_name="two_factor_otps", if_exists=True)

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_two_factor_challenges_token_hash'
            ) THEN
                ALTER TABLE two_factor_challenges
                    DROP CONSTRAINT uq_two_factor_challenges_token_hash;
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'two_factor_challenges_token_hash_key'
            ) THEN
                ALTER TABLE two_factor_challenges
                    ADD CONSTRAINT two_factor_challenges_token_hash_key UNIQUE (token_hash);
            END IF;
        END $$;
    """)
    op.drop_index(
        op.f("ix_two_factor_challenges_id"), table_name="two_factor_challenges", if_exists=True
    )

    op.drop_index(
        op.f("ix_attendance_devices_user_id"), table_name="attendance_devices", if_exists=True
    )
    op.drop_index(
        op.f("ix_attendance_devices_device_code"), table_name="attendance_devices", if_exists=True
    )
    op.drop_index(op.f("ix_attendance_devices_id"), table_name="attendance_devices", if_exists=True)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'attendance_devices_user_id_key'
            ) THEN
                ALTER TABLE attendance_devices
                    ADD CONSTRAINT attendance_devices_user_id_key UNIQUE (user_id);
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'attendance_devices_device_code_key'
            ) THEN
                ALTER TABLE attendance_devices
                    ADD CONSTRAINT attendance_devices_device_code_key UNIQUE (device_code);
            END IF;
        END $$;
    """)
    op.create_index(
        "ix_attendance_devices_user_id",
        "attendance_devices",
        ["user_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_attendance_devices_device_code",
        "attendance_devices",
        ["device_code"],
        unique=False,
        if_not_exists=True,
    )
