"""batch2 invoice sequences and product prices

Revision ID: 9f2b7c4d1e6a
Revises: 3a63a307cc76
Create Date: 2026-04-18 21:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "9f2b7c4d1e6a"
down_revision: str | None = "3a63a307cc76"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "branch_sequences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("next_number", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "year", name="uq_branch_sequences_branch_year"),
    )
    op.create_index(op.f("ix_branch_sequences_id"), "branch_sequences", ["id"], unique=False)
    op.create_index(
        op.f("ix_branch_sequences_branch_id"), "branch_sequences", ["branch_id"], unique=False
    )
    op.create_index(op.f("ix_branch_sequences_year"), "branch_sequences", ["year"], unique=False)

    op.create_table(
        "product_prices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("currency_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["currency_id"], ["currencies.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "product_id",
            "currency_id",
            "valid_from",
            name="uq_product_prices_product_currency_valid_from",
        ),
    )
    op.create_index(op.f("ix_product_prices_id"), "product_prices", ["id"], unique=False)
    op.create_index(
        op.f("ix_product_prices_product_id"), "product_prices", ["product_id"], unique=False
    )
    op.create_index(
        op.f("ix_product_prices_currency_id"), "product_prices", ["currency_id"], unique=False
    )
    op.create_index(
        op.f("ix_product_prices_valid_from"), "product_prices", ["valid_from"], unique=False
    )

    op.alter_column(
        "sales_invoices",
        "invoice_number",
        existing_type=sa.String(length=64),
        type_=sa.String(length=96),
        existing_nullable=False,
    )

    op.execute(
        sa.text(
            """
            INSERT INTO product_prices (product_id, currency_id, amount, valid_from, created_at)
            SELECT
                products.id,
                accounting_settings.base_currency_id,
                CAST(products.attributes ->> 'price' AS NUMERIC(12, 2)),
                COALESCE(products.updated_at, products.created_at, CURRENT_TIMESTAMP),
                CURRENT_TIMESTAMP
            FROM products
            CROSS JOIN accounting_settings
            WHERE accounting_settings.id = 1
              AND products.attributes ? 'price'
              AND NULLIF(BTRIM(products.attributes ->> 'price'), '') IS NOT NULL
              AND (products.attributes ->> 'price') ~ '^-?[0-9]+(\\.[0-9]+)?$'
            """
        )
    )


def downgrade() -> None:
    op.alter_column(
        "sales_invoices",
        "invoice_number",
        existing_type=sa.String(length=96),
        type_=sa.String(length=64),
        existing_nullable=False,
    )

    op.drop_index(op.f("ix_product_prices_valid_from"), table_name="product_prices")
    op.drop_index(op.f("ix_product_prices_currency_id"), table_name="product_prices")
    op.drop_index(op.f("ix_product_prices_product_id"), table_name="product_prices")
    op.drop_index(op.f("ix_product_prices_id"), table_name="product_prices")
    op.drop_table("product_prices")

    op.drop_index(op.f("ix_branch_sequences_year"), table_name="branch_sequences")
    op.drop_index(op.f("ix_branch_sequences_branch_id"), table_name="branch_sequences")
    op.drop_index(op.f("ix_branch_sequences_id"), table_name="branch_sequences")
    op.drop_table("branch_sequences")
