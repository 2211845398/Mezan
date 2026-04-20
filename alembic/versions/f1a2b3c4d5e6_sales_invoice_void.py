"""Sales invoice void metadata (same-period reversal guard support).

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-04-20

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sales_invoices",
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "sales_invoices",
        sa.Column("void_reason", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "sales_invoices",
        sa.Column("voided_by_user_id", sa.Integer(), nullable=True),
    )
    op.create_index(op.f("ix_sales_invoices_voided_at"), "sales_invoices", ["voided_at"], unique=False)
    op.create_index(
        op.f("ix_sales_invoices_voided_by_user_id"),
        "sales_invoices",
        ["voided_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_sales_invoices_voided_by_user_id_users",
        "sales_invoices",
        "users",
        ["voided_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_sales_invoices_voided_by_user_id_users", "sales_invoices", type_="foreignkey")
    op.drop_index(op.f("ix_sales_invoices_voided_by_user_id"), table_name="sales_invoices")
    op.drop_index(op.f("ix_sales_invoices_voided_at"), table_name="sales_invoices")
    op.drop_column("sales_invoices", "voided_by_user_id")
    op.drop_column("sales_invoices", "void_reason")
    op.drop_column("sales_invoices", "voided_at")
