"""Add payment_status to sales_invoices for partial POS settlement."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w8x9y0z1a2b3"
down_revision: Union[str, None] = "v7w8x9y0z1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales_invoices",
        sa.Column(
            "payment_status",
            sa.String(length=20),
            nullable=False,
            server_default="paid",
        ),
    )


def downgrade() -> None:
    op.drop_column("sales_invoices", "payment_status")
