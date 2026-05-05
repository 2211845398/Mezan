"""annual leave entitlement on employee_profiles

Revision ID: c7e8f9a0b1c2
Revises: f02e85ade20a
Create Date: 2026-05-05

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c7e8f9a0b1c2"
down_revision: str | None = "f02e85ade20a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "employee_profiles",
        sa.Column(
            "annual_leave_entitlement_days",
            sa.Numeric(precision=8, scale=2),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("employee_profiles", "annual_leave_entitlement_days")
