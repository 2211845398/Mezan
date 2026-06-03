"""Add currencies.active, payment_terms master, suppliers.payment_terms_id.

Revision ID: g9h0i1j2k3l4
Revises: d4e5f6a7b8c9
Create Date: 2026-05-20
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision: str = "g9h0i1j2k3l4"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DEFAULT_TERMS: list[tuple[str, str, str, int]] = [
    ("NET_0", "Net 0", "عند الاستلام", 0),
    ("NET_15", "Net 15", "خلال 15 يوماً", 15),
    ("NET_30", "Net 30", "خلال 30 يوماً", 30),
    ("NET_45", "Net 45", "خلال 45 يوماً", 45),
    ("NET_60", "Net 60", "خلال 60 يوماً", 60),
]


def upgrade() -> None:
    op.add_column(
        "currencies",
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.create_table(
        "payment_terms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name_en", sa.String(length=128), nullable=False),
        sa.Column("name_ar", sa.String(length=128), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name=op.f("uq_payment_terms_code")),
    )
    op.create_index(op.f("ix_payment_terms_code"), "payment_terms", ["code"], unique=True)

    op.add_column(
        "suppliers",
        sa.Column("payment_terms_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_suppliers_payment_terms_id_payment_terms"),
        "suppliers",
        "payment_terms",
        ["payment_terms_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_suppliers_payment_terms_id"),
        "suppliers",
        ["payment_terms_id"],
        unique=False,
    )

    now = datetime.now(UTC)
    terms = sa.table(
        "payment_terms",
        sa.column("code", sa.String),
        sa.column("name_en", sa.String),
        sa.column("name_ar", sa.String),
        sa.column("days", sa.Integer),
        sa.column("active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        terms,
        [
            {
                "code": code,
                "name_en": name_en,
                "name_ar": name_ar,
                "days": days,
                "active": True,
                "created_at": now,
            }
            for code, name_en, name_ar, days in _DEFAULT_TERMS
        ],
    )

    # Map legacy supplier text labels to FK where possible
    op.execute(
        """
        UPDATE suppliers s
        SET payment_terms_id = pt.id
        FROM payment_terms pt
        WHERE s.payment_terms IS NOT NULL
          AND pt.name_en = s.payment_terms
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_suppliers_payment_terms_id_payment_terms"),
        "suppliers",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_suppliers_payment_terms_id"), table_name="suppliers")
    op.drop_column("suppliers", "payment_terms_id")
    op.drop_index(op.f("ix_payment_terms_code"), table_name="payment_terms")
    op.drop_table("payment_terms")
    op.drop_column("currencies", "active")
