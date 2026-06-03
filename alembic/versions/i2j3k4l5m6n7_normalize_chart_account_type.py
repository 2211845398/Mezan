"""Normalize chart_accounts.account_type to lowercase PEP-435 values.

Revision ID: i2j3k4l5m6n7
Revises: h1i2j3k4l5m6
Create Date: 2026-05-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "i2j3k4l5m6n7"
down_revision: str | None = "h1i2j3k4l5m6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACCOUNT_TYPES = ("asset", "liability", "equity", "revenue", "expense")


def upgrade() -> None:
    conn = op.get_bind()
    for value in _ACCOUNT_TYPES:
        conn.execute(
            sa.text(
                "UPDATE chart_accounts SET account_type = :lower WHERE UPPER(account_type) = :upper"
            ),
            {"lower": value, "upper": value.upper()},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for value in _ACCOUNT_TYPES:
        conn.execute(
            sa.text("UPDATE chart_accounts SET account_type = :upper WHERE account_type = :lower"),
            {"upper": value.upper(), "lower": value},
        )
