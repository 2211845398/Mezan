"""Add hr_feedback table for employee self-service notes.

Revision ID: z1a2b3c4d5e6
Revises: c15cec5e5b2a
Create Date: 2026-06-05

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "z1a2b3c4d5e6"
down_revision: str | None = "c15cec5e5b2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hr_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("employee_profile_id", sa.Integer(), nullable=True),
        sa.Column("branch_id", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["employee_profile_id"], ["employee_profiles.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hr_feedback_id"), "hr_feedback", ["id"], unique=False)
    op.create_index(op.f("ix_hr_feedback_user_id"), "hr_feedback", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_hr_feedback_employee_profile_id"),
        "hr_feedback",
        ["employee_profile_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_hr_feedback_branch_id"), "hr_feedback", ["branch_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_hr_feedback_branch_id"), table_name="hr_feedback")
    op.drop_index(op.f("ix_hr_feedback_employee_profile_id"), table_name="hr_feedback")
    op.drop_index(op.f("ix_hr_feedback_user_id"), table_name="hr_feedback")
    op.drop_index(op.f("ix_hr_feedback_id"), table_name="hr_feedback")
    op.drop_table("hr_feedback")
