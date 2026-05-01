"""users.avatar_url for profile picture URL

Revision ID: b1c2d3e4f5a7
Revises: f9a8b7c6d5e4
Create Date: 2026-05-01

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b1c2d3e4f5a7"
down_revision: str | None = "f9a8b7c6d5e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(length=2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
