"""Split single full name into first / father / family columns.

Revision ID: d4f8a1c2e3b0
Revises: c8e2f4a1b9d0
Create Date: 2026-05-17

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4f8a1c2e3b0"
down_revision: str | None = "c8e2f4a1b9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- customer_profiles ---
    op.add_column(
        "customer_profiles", sa.Column("first_name", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "customer_profiles", sa.Column("father_name", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "customer_profiles", sa.Column("family_name", sa.String(length=255), nullable=True)
    )
    op.execute(
        sa.text(
            "UPDATE customer_profiles SET first_name = full_name "
            "WHERE full_name IS NOT NULL AND btrim(full_name) <> ''"
        )
    )
    op.drop_column("customer_profiles", "full_name")

    # --- users ---
    op.add_column("users", sa.Column("first_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("father_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("family_name", sa.String(length=255), nullable=True))
    op.execute(
        sa.text(
            "UPDATE users SET first_name = full_name "
            "WHERE full_name IS NOT NULL AND btrim(full_name) <> ''"
        )
    )
    op.drop_column("users", "full_name")

    # --- suppliers (was ``name``) ---
    op.drop_index(op.f("ix_suppliers_name"), table_name="suppliers")
    op.add_column("suppliers", sa.Column("first_name", sa.String(length=255), nullable=True))
    op.add_column("suppliers", sa.Column("father_name", sa.String(length=255), nullable=True))
    op.add_column("suppliers", sa.Column("family_name", sa.String(length=255), nullable=True))
    op.execute(
        sa.text(
            "UPDATE suppliers SET first_name = name WHERE name IS NOT NULL AND btrim(name) <> ''"
        )
    )
    op.drop_column("suppliers", "name")


def downgrade() -> None:
    op.add_column(
        "suppliers",
        sa.Column("name", sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE suppliers SET name = NULLIF("
            "btrim(concat_ws(' ', first_name, father_name, family_name)), '')"
        )
    )
    op.alter_column("suppliers", "name", nullable=False)
    op.drop_column("suppliers", "family_name")
    op.drop_column("suppliers", "father_name")
    op.drop_column("suppliers", "first_name")
    op.create_index(op.f("ix_suppliers_name"), "suppliers", ["name"], unique=False)

    op.add_column(
        "users",
        sa.Column("full_name", sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE users SET full_name = NULLIF("
            "btrim(concat_ws(' ', first_name, father_name, family_name)), '')"
        )
    )
    op.drop_column("users", "family_name")
    op.drop_column("users", "father_name")
    op.drop_column("users", "first_name")

    op.add_column(
        "customer_profiles",
        sa.Column("full_name", sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE customer_profiles SET full_name = NULLIF("
            "btrim(concat_ws(' ', first_name, father_name, family_name)), '')"
        )
    )
    op.drop_column("customer_profiles", "family_name")
    op.drop_column("customer_profiles", "father_name")
    op.drop_column("customer_profiles", "first_name")
