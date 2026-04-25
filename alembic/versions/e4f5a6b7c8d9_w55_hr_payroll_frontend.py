"""W-5.5: payslip idempotency keys, leave review notes, attendance log index."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payslips", sa.Column("generate_idempotency_key", sa.String(128), nullable=True))
    op.add_column("payslips", sa.Column("approve_idempotency_key", sa.String(128), nullable=True))
    op.create_index(
        "ix_payslips_generate_idempotency_key",
        "payslips",
        ["generate_idempotency_key"],
        unique=True,
    )
    op.create_index(
        "ix_payslips_approve_idempotency_key",
        "payslips",
        ["approve_idempotency_key"],
        unique=True,
    )

    op.add_column("leave_requests", sa.Column("review_notes", sa.String(1024), nullable=True))
    op.add_column("leave_requests", sa.Column("review_idempotency_key", sa.String(128), nullable=True))
    op.create_index(
        "ix_leave_requests_review_idempotency_key",
        "leave_requests",
        ["review_idempotency_key"],
        unique=True,
    )

    op.create_index("ix_attendance_logs_clock_in_at", "attendance_logs", ["clock_in_at"], unique=False)
    op.create_index("ix_leave_requests_status", "leave_requests", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_leave_requests_status", table_name="leave_requests")
    op.drop_index("ix_attendance_logs_clock_in_at", table_name="attendance_logs")
    op.drop_index("ix_leave_requests_review_idempotency_key", table_name="leave_requests")
    op.drop_column("leave_requests", "review_idempotency_key")
    op.drop_column("leave_requests", "review_notes")
    op.drop_index("ix_payslips_approve_idempotency_key", table_name="payslips")
    op.drop_index("ix_payslips_generate_idempotency_key", table_name="payslips")
    op.drop_column("payslips", "approve_idempotency_key")
    op.drop_column("payslips", "generate_idempotency_key")
