"""Journal sub-ledger dimensions, is_leaf, subledger_kind, AR trade receivables leaf.

Revision ID: s2t3u4v5w6
Revises: r1s2t3u4v5w6
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s2t3u4v5w6"
down_revision: Union[str, None] = "r1s2t3u4v5w6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chart_accounts",
        sa.Column("is_leaf", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "chart_accounts",
        sa.Column(
            "subledger_kind",
            sa.String(length=16),
            nullable=False,
            server_default="none",
        ),
    )

    op.add_column(
        "journal_entry_lines",
        sa.Column("customer_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "journal_entry_lines",
        sa.Column("supplier_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "journal_entry_lines",
        sa.Column("employee_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_journal_entry_lines_customer_id_customer_profiles"),
        "journal_entry_lines",
        "customer_profiles",
        ["customer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_journal_entry_lines_supplier_id_suppliers"),
        "journal_entry_lines",
        "suppliers",
        ["supplier_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_journal_entry_lines_employee_id_employee_profiles"),
        "journal_entry_lines",
        "employee_profiles",
        ["employee_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_journal_entry_lines_customer_id"),
        "journal_entry_lines",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_journal_entry_lines_supplier_id"),
        "journal_entry_lines",
        ["supplier_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_journal_entry_lines_employee_id"),
        "journal_entry_lines",
        ["employee_id"],
        unique=False,
    )
    op.create_check_constraint(
        "ck_journal_entry_lines_single_subledger",
        "journal_entry_lines",
        (
            "(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN supplier_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN employee_id IS NOT NULL THEN 1 ELSE 0 END) <= 1"
        ),
    )

    conn = op.get_bind()

    # Parents with children are not posting leaves.
    conn.execute(
        sa.text(
            """
            UPDATE chart_accounts AS p
            SET is_leaf = false
            WHERE EXISTS (
                SELECT 1 FROM chart_accounts AS c
                WHERE c.parent_id = p.id
            )
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE chart_accounts
            SET is_leaf = false
            WHERE is_control = true
            """
        )
    )

    # Subledger kinds for known system accounts.
    conn.execute(
        sa.text(
            """
            UPDATE chart_accounts SET subledger_kind = 'customer' WHERE code = '1100'
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE chart_accounts SET subledger_kind = 'supplier' WHERE code = '2000'
            """
        )
    )

    ar_parent = conn.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '1100' LIMIT 1")
    ).fetchone()

    if ar_parent is not None:
        parent_id = int(ar_parent[0])
        existing_1110 = conn.execute(
            sa.text("SELECT id FROM chart_accounts WHERE code = '1110' LIMIT 1")
        ).fetchone()

        if existing_1110 is None:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO chart_accounts (
                        code, name, account_type, parent_id,
                        is_control, is_system, active, is_leaf, subledger_kind
                    )
                    VALUES (
                        '1110', 'Trade Receivables', 'asset', :parent_id,
                        false, true, true, true, 'customer'
                    )
                    """
                ),
                {"parent_id": parent_id},
            )
            leaf_row = conn.execute(
                sa.text("SELECT id FROM chart_accounts WHERE code = '1110' LIMIT 1")
            ).fetchone()
        else:
            conn.execute(
                sa.text(
                    """
                    UPDATE chart_accounts
                    SET parent_id = :parent_id,
                        is_control = false,
                        is_leaf = true,
                        subledger_kind = 'customer'
                    WHERE code = '1110'
                    """
                ),
                {"parent_id": parent_id},
            )
            leaf_row = existing_1110

        if leaf_row is not None:
            leaf_id = int(leaf_row[0])
            conn.execute(
                sa.text(
                    """
                    UPDATE accounting_settings
                    SET default_ar_account_id = :leaf_id
                    WHERE default_ar_account_id IN (
                        SELECT id FROM chart_accounts WHERE code = '1100'
                    )
                    OR default_ar_account_id IS NULL
                    """
                ),
                {"leaf_id": leaf_id},
            )
            conn.execute(
                sa.text(
                    """
                    UPDATE customer_profiles
                    SET receivables_account_id = :leaf_id
                    WHERE receivables_account_id IN (
                        SELECT id FROM chart_accounts WHERE code = '1100' AND is_control = true
                    )
                    """
                ),
                {"leaf_id": leaf_id},
            )

    conn.execute(
        sa.text(
            """
            UPDATE chart_accounts SET subledger_kind = 'customer' WHERE code = '1110'
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE chart_accounts SET subledger_kind = 'supplier' WHERE code = '2010'
            """
        )
    )

    op.alter_column("chart_accounts", "is_leaf", server_default=None)
    op.alter_column("chart_accounts", "subledger_kind", server_default=None)


def downgrade() -> None:
    conn = op.get_bind()
    ar_parent = conn.execute(
        sa.text("SELECT id FROM chart_accounts WHERE code = '1100' LIMIT 1")
    ).fetchone()
    if ar_parent is not None:
        conn.execute(
            sa.text(
                """
                UPDATE accounting_settings
                SET default_ar_account_id = :parent_id
                WHERE default_ar_account_id IN (
                    SELECT id FROM chart_accounts WHERE code = '1110'
                )
                """
            ),
            {"parent_id": int(ar_parent[0])},
        )
    conn.execute(sa.text("DELETE FROM chart_accounts WHERE code = '1110'"))

    op.drop_constraint(
        "ck_journal_entry_lines_single_subledger",
        "journal_entry_lines",
        type_="check",
    )
    op.drop_index(op.f("ix_journal_entry_lines_employee_id"), table_name="journal_entry_lines")
    op.drop_index(op.f("ix_journal_entry_lines_supplier_id"), table_name="journal_entry_lines")
    op.drop_index(op.f("ix_journal_entry_lines_customer_id"), table_name="journal_entry_lines")
    op.drop_constraint(
        op.f("fk_journal_entry_lines_employee_id_employee_profiles"),
        "journal_entry_lines",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_journal_entry_lines_supplier_id_suppliers"),
        "journal_entry_lines",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_journal_entry_lines_customer_id_customer_profiles"),
        "journal_entry_lines",
        type_="foreignkey",
    )
    op.drop_column("journal_entry_lines", "employee_id")
    op.drop_column("journal_entry_lines", "supplier_id")
    op.drop_column("journal_entry_lines", "customer_id")
    op.drop_column("chart_accounts", "subledger_kind")
    op.drop_column("chart_accounts", "is_leaf")
