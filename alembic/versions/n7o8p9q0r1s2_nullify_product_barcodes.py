"""Move product-level barcodes to default variants and null products.barcode.

Revision ID: n7o8p9q0r1s2
Revises: m6n7o8p9q0r1
Create Date: 2026-05-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n7o8p9q0r1s2"
down_revision: Union[str, None] = "m6n7o8p9q0r1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE product_variants pv
            SET barcode = p.barcode
            FROM products p
            WHERE pv.product_id = p.id
              AND p.barcode IS NOT NULL
              AND TRIM(p.barcode) <> ''
              AND (pv.barcode IS NULL OR TRIM(pv.barcode) = '')
              AND pv.combination_key = '_default'
            """
        )
    )
    conn.execute(sa.text("UPDATE products SET barcode = NULL WHERE barcode IS NOT NULL"))


def downgrade() -> None:
    pass
