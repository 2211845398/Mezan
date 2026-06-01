"""Trade payables leaf account (2010), fix default AP, goods_receipts.notes.

Revision ID: h1i2j3k4l5m6
Revises: g9h0i1j2k3l4
Create Date: 2026-05-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h1i2j3k4l5m6"
down_revision: Union[str, None] = "g9h0i1j2k3l4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _goods_receipts_has_notes(conn) -> bool:
    row = conn.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'goods_receipts'
              AND column_name = 'notes'
            LIMIT 1
            """
        )
    ).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()

    if not _goods_receipts_has_notes(conn):
        op.add_column(
            "goods_receipts",
            sa.Column("notes", sa.String(length=1024), nullable=True),
        )

    ap_parent = conn.execute(
        sa.text(
            "SELECT id FROM chart_accounts WHERE code = '2000' LIMIT 1"
        )
    ).fetchone()
    if ap_parent is None:
        return

    parent_id = int(ap_parent[0])
    existing_2010 = conn.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '2010' LIMIT 1")
    ).fetchone()

    if existing_2010 is None:
        conn.execute(
            sa.text(
                """
                INSERT INTO chart_accounts (
                    code, name, account_type, parent_id,
                    is_control, is_system, active
                )
                VALUES (
                    '2010', 'Trade Payables', 'liability', :parent_id,
                    false, true, true
                )
                """
            ),
            {"parent_id": parent_id},
        )
        leaf_row = conn.execute(
            sa.text("SELECT id FROM chart_accounts WHERE code = '2010' LIMIT 1")
        ).fetchone()
    else:
        leaf_row = existing_2010

    if leaf_row is not None:
        leaf_id = int(leaf_row[0])
        conn.execute(
            sa.text(
                """
                UPDATE accounting_settings
                SET default_ap_account_id = :leaf_id
                WHERE default_ap_account_id IN (
                    SELECT id FROM chart_accounts WHERE code = '2000'
                )
                OR default_ap_account_id IS NULL
                """
            ),
            {"leaf_id": leaf_id},
        )
        conn.execute(
            sa.text(
                """
                UPDATE suppliers
                SET payables_account_id = :leaf_id
                WHERE payables_account_id IN (
                    SELECT id FROM chart_accounts WHERE code = '2000' AND is_control = true
                )
                """
            ),
            {"leaf_id": leaf_id},
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _goods_receipts_has_notes(conn):
        op.drop_column("goods_receipts", "notes")
    ap_parent = conn.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '2000' LIMIT 1")
    ).fetchone()
    if ap_parent is not None:
        conn.execute(
            sa.text(
                """
                UPDATE accounting_settings
                SET default_ap_account_id = :parent_id
                WHERE default_ap_account_id IN (
                    SELECT id FROM chart_accounts WHERE code = '2010'
                )
                """
            ),
            {"parent_id": int(ap_parent[0])},
        )
    conn.execute(sa.text("DELETE FROM chart_accounts WHERE code = '2010'"))
