"""Rename loyalty liability chart account 2120 -> 2150.

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-20

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()

    row_2150 = bind.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '2150' LIMIT 1")
    ).scalar()
    if row_2150 is not None:
        return

    row_2120 = bind.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '2120' LIMIT 1")
    ).scalar()
    if row_2120 is not None:
        bind.execute(
            sa.text(
                """
                UPDATE chart_accounts
                SET code = '2150',
                    name = 'Loyalty Points Liability'
                WHERE code = '2120'
                """
            )
        )
        return

    # No 2120 or 2150: insert system liability and link settings if present.
    bind.execute(
        sa.text(
            """
            INSERT INTO chart_accounts (code, name, account_type, parent_id, is_control, is_system, active)
            SELECT '2150', 'Loyalty Points Liability', 'liability', NULL, false, true, true
            WHERE NOT EXISTS (SELECT 1 FROM chart_accounts WHERE code = '2150')
            """
        )
    )
    new_id = bind.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '2150' LIMIT 1")
    ).scalar()
    if new_id is None:
        return
    bind.execute(
        sa.text(
            """
            UPDATE accounting_settings
            SET default_loyalty_liability_account_id = :aid
            WHERE id = 1
              AND EXISTS (SELECT 1 FROM accounting_settings WHERE id = 1)
            """
        ),
        {"aid": new_id},
    )


def downgrade() -> None:
    bind = op.get_bind()
    row_2150 = bind.execute(
        sa.text(
            """
            SELECT ca.id FROM chart_accounts ca
            WHERE ca.code = '2150'
              AND ca.name = 'Loyalty Points Liability'
            LIMIT 1
            """
        )
    ).scalar()
    if row_2150 is None:
        return
    row_2120 = bind.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '2120' LIMIT 1")
    ).scalar()
    if row_2120 is not None:
        return
    bind.execute(
        sa.text(
            """
            UPDATE chart_accounts
            SET code = '2120',
                name = 'Loyalty Points Liability'
            WHERE id = :id AND code = '2150'
            """
        ),
        {"id": row_2150},
    )
