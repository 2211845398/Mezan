"""Backfill variant_id and restore NOT NULL on stock/sales line tables.

Revision ID: c2e9b8a1d4f7
Revises: b7e1a9d3c5f2
Create Date: 2026-05-13

Epic 18 migration 7e8d9f2a3b4c enforced NOT NULL; 150169d2047f re-opened nullable
columns. This aligns the database with ORM expectations before Workstream B wiring.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2e9b8a1d4f7"
down_revision: Union[str, None] = "b7e1a9d3c5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BACKFILL_SQL = """
UPDATE {tbl} AS t
SET variant_id = COALESCE(
    (
        SELECT pv.id
        FROM product_variants pv
        WHERE pv.product_id = t.product_id AND pv.active = true
        ORDER BY pv.id ASC
        LIMIT 1
    ),
    (
        SELECT pv.id
        FROM product_variants pv
        WHERE pv.product_id = t.product_id
        ORDER BY pv.id ASC
        LIMIT 1
    )
)
WHERE t.variant_id IS NULL
"""


def upgrade() -> None:
    tables = (
        "stock_movements",
        "stock_levels",
        "branch_product_costs",
        "pos_cart_lines",
        "sales_invoice_lines",
        "purchase_order_lines",
        "goods_receipt_lines",
        "transfer_lines",
        "sales_return_lines",
    )
    for tbl in tables:
        op.execute(sa.text(_BACKFILL_SQL.format(tbl=tbl)))

    for tbl in tables:
        op.alter_column(
            tbl,
            "variant_id",
            existing_type=sa.Integer(),
            nullable=False,
        )


def downgrade() -> None:
    tables = (
        "sales_return_lines",
        "transfer_lines",
        "goods_receipt_lines",
        "purchase_order_lines",
        "sales_invoice_lines",
        "pos_cart_lines",
        "branch_product_costs",
        "stock_levels",
        "stock_movements",
    )
    for tbl in tables:
        op.alter_column(
            tbl,
            "variant_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
