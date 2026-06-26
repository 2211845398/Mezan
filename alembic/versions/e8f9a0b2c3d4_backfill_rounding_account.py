"""Backfill cash rounding GL account (6080) and accounting_settings FK."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e8f9a0b2c3d4"
down_revision: str | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    parent_row = conn.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '60000' LIMIT 1")
    ).fetchone()
    if parent_row is None:
        parent_row = conn.execute(
            sa.text("SELECT parent_id FROM chart_accounts WHERE code = '6070' LIMIT 1")
        ).fetchone()
    parent_id = int(parent_row[0]) if parent_row and parent_row[0] is not None else None

    existing = conn.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '6080' LIMIT 1")
    ).fetchone()

    if existing is None:
        conn.execute(
            sa.text(
                """
                INSERT INTO chart_accounts (
                    code, name, name_ar, name_en, account_type, parent_id,
                    is_control, is_system, active, is_leaf, subledger_kind
                )
                VALUES (
                    '6080',
                    'Cash Rounding Differences',
                    'فروقات تقريب نقدي',
                    'Cash Rounding Differences',
                    'expense',
                    :parent_id,
                    false,
                    true,
                    true,
                    true,
                    'none'
                )
                """
            ),
            {"parent_id": parent_id},
        )
    else:
        conn.execute(
            sa.text(
                """
                UPDATE chart_accounts
                SET name = 'Cash Rounding Differences',
                    name_ar = COALESCE(name_ar, 'فروقات تقريب نقدي'),
                    name_en = COALESCE(name_en, 'Cash Rounding Differences'),
                    account_type = 'expense',
                    parent_id = COALESCE(:parent_id, parent_id),
                    is_control = false,
                    is_system = true,
                    is_leaf = true,
                    subledger_kind = 'none',
                    active = true
                WHERE code = '6080'
                """
            ),
            {"parent_id": parent_id},
        )

    conn.execute(
        sa.text(
            """
            UPDATE accounting_settings
            SET default_rounding_difference_account_id = (
                SELECT id FROM chart_accounts WHERE code = '6080' LIMIT 1
            )
            WHERE id = 1
              AND default_rounding_difference_account_id IS NULL
            """
        )
    )


def downgrade() -> None:
    op.execute(
        "UPDATE accounting_settings SET default_rounding_difference_account_id = NULL WHERE id = 1"
    )
