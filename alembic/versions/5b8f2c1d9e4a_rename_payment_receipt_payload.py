"""rename payment receipt payload field

Revision ID: 5b8f2c1d9e4a
Revises: 9f2b7c4d1e6a
Create Date: 2026-04-18 22:30:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "5b8f2c1d9e4a"
down_revision: str | None = "9f2b7c4d1e6a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "payment_receipts",
        "redacted_payload",
        new_column_name="provider_payload",
    )


def downgrade() -> None:
    op.alter_column(
        "payment_receipts",
        "provider_payload",
        new_column_name="redacted_payload",
    )
