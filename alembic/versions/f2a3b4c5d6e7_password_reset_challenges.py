"""Add password_reset_challenges table for OTP-based password reset.

Revision ID: f2a3b4c5d6e7
Revises: e8f9a0b2c3d4
Create Date: 2026-06-17

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: str | None = "e8f9a0b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "password_reset_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("challenge_token_hash", sa.String(length=128), nullable=False),
        sa.Column("otp_code_hash", sa.String(length=128), nullable=False),
        sa.Column("reset_token_hash", sa.String(length=128), nullable=True),
        sa.Column("otp_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reset_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("challenge_token_hash"),
    )
    op.create_index(
        op.f("ix_password_reset_challenges_id"),
        "password_reset_challenges",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_password_reset_challenges_user_id"),
        "password_reset_challenges",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_password_reset_challenges_reset_token_hash"),
        "password_reset_challenges",
        ["reset_token_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_password_reset_challenges_reset_token_hash"),
        table_name="password_reset_challenges",
    )
    op.drop_index(
        op.f("ix_password_reset_challenges_user_id"),
        table_name="password_reset_challenges",
    )
    op.drop_index(
        op.f("ix_password_reset_challenges_id"),
        table_name="password_reset_challenges",
    )
    op.drop_table("password_reset_challenges")
