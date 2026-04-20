"""Currency FX to base + snapshot exchange_rate on payment_intents.

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-04-20

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | None = "a2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "currencies",
        sa.Column("exchange_rate_to_base", sa.Numeric(precision=18, scale=8), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE currencies AS c
            SET exchange_rate_to_base = 1
            FROM accounting_settings AS s
            WHERE s.id = 1 AND c.id = s.base_currency_id
            """
        )
    )
    op.add_column(
        "payment_intents",
        sa.Column(
            "exchange_rate",
            sa.Numeric(precision=18, scale=8),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("payment_intents", "exchange_rate")
    op.drop_column("currencies", "exchange_rate_to_base")
