"""Create missing BoM, production, FIFO cost layers, and AI usage log tables.

Revision ID: a3f8c2b1e4d0
Revises: f441af8774f2
Create Date: 2026-05-13

Prior revisions c2ad13cd9886 / f441af8774f2 were no-ops; this applies the DDL
mirroring app/models/bom.py, inventory_cost_layer.py, ai_usage_log.py.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a3f8c2b1e4d0"
down_revision: Union[str, None] = "f441af8774f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bill_of_materials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("finished_product_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False, server_default="1.0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["finished_product_id"],
            ["products.id"],
            name=op.f("fk_bill_of_materials_finished_product_id_products"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bill_of_materials")),
    )
    op.create_index(
        op.f("ix_bill_of_materials_finished_product_id"),
        "bill_of_materials",
        ["finished_product_id"],
        unique=False,
    )
    op.create_index(op.f("ix_bill_of_materials_id"), "bill_of_materials", ["id"], unique=False)

    op.create_table(
        "bom_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bom_id", sa.Integer(), nullable=False),
        sa.Column("component_product_id", sa.Integer(), nullable=False),
        sa.Column("qty_required", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("unit_cost_at_creation", sa.Numeric(precision=14, scale=4), nullable=True),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["bom_id"],
            ["bill_of_materials.id"],
            name=op.f("fk_bom_lines_bom_id_bill_of_materials"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["component_product_id"],
            ["products.id"],
            name=op.f("fk_bom_lines_component_product_id_products"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bom_lines")),
    )
    op.create_index(op.f("ix_bom_lines_bom_id"), "bom_lines", ["bom_id"], unique=False)
    op.create_index(
        op.f("ix_bom_lines_component_product_id"),
        "bom_lines",
        ["component_product_id"],
        unique=False,
    )
    op.create_index(op.f("ix_bom_lines_id"), "bom_lines", ["id"], unique=False)

    op.create_table(
        "production_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_number", sa.String(length=64), nullable=False),
        sa.Column("bom_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("qty_to_produce", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column(
            "qty_produced",
            sa.Numeric(precision=14, scale=4),
            nullable=False,
            server_default="0",
        ),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("planned_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "total_cost_issued",
            sa.Numeric(precision=14, scale=2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "finished_goods_value",
            sa.Numeric(precision=14, scale=2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["bom_id"],
            ["bill_of_materials.id"],
            name=op.f("fk_production_orders_bom_id_bill_of_materials"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_production_orders_branch_id_branches"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_production_orders_created_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_orders")),
        sa.UniqueConstraint("order_number", name=op.f("uq_production_orders_order_number")),
    )
    op.create_index(op.f("ix_production_orders_bom_id"), "production_orders", ["bom_id"], unique=False)
    op.create_index(
        op.f("ix_production_orders_branch_id"), "production_orders", ["branch_id"], unique=False
    )
    op.create_index(op.f("ix_production_orders_id"), "production_orders", ["id"], unique=False)

    op.create_table(
        "production_order_issues",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("production_order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("total_cost", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("issued_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["issued_by_user_id"],
            ["users.id"],
            name=op.f("fk_production_order_issues_issued_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_production_order_issues_product_id_products"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["production_order_id"],
            ["production_orders.id"],
            name=op.f("fk_production_order_issues_production_order_id_production_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["variant_id"],
            ["product_variants.id"],
            name=op.f("fk_production_order_issues_variant_id_product_variants"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_order_issues")),
    )
    op.create_index(
        op.f("ix_production_order_issues_id"), "production_order_issues", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_production_order_issues_product_id"),
        "production_order_issues",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_production_order_issues_production_order_id"),
        "production_order_issues",
        ["production_order_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_production_order_issues_variant_id"),
        "production_order_issues",
        ["variant_id"],
        unique=False,
    )

    op.create_table(
        "production_order_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("production_order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("total_cost", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_production_order_receipts_product_id_products"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["production_order_id"],
            ["production_orders.id"],
            name=op.f("fk_production_order_receipts_production_order_id_production_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["received_by_user_id"],
            ["users.id"],
            name=op.f("fk_production_order_receipts_received_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["variant_id"],
            ["product_variants.id"],
            name=op.f("fk_production_order_receipts_variant_id_product_variants"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_order_receipts")),
    )
    op.create_index(
        op.f("ix_production_order_receipts_id"),
        "production_order_receipts",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_production_order_receipts_product_id"),
        "production_order_receipts",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_production_order_receipts_production_order_id"),
        "production_order_receipts",
        ["production_order_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_production_order_receipts_variant_id"),
        "production_order_receipts",
        ["variant_id"],
        unique=False,
    )

    op.create_table(
        "inventory_cost_layers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("original_qty", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("qty_remaining", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("unit_cost", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("total_cost", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column(
            "fx_rate",
            sa.Numeric(precision=18, scale=8),
            nullable=False,
            server_default="1",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_inventory_cost_layers_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_inventory_cost_layers_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["variant_id"],
            ["product_variants.id"],
            name=op.f("fk_inventory_cost_layers_variant_id_product_variants"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_cost_layers")),
    )
    op.create_index(
        op.f("ix_inventory_cost_layers_branch_id"),
        "inventory_cost_layers",
        ["branch_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_cost_layers_product_id"),
        "inventory_cost_layers",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_cost_layers_source_id"),
        "inventory_cost_layers",
        ["source_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_cost_layers_variant_id"),
        "inventory_cost_layers",
        ["variant_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_cost_layers_branch_product_variant_received",
        "inventory_cost_layers",
        ["branch_id", "product_id", "variant_id", "received_at"],
        unique=False,
    )

    op.create_table(
        "ai_usage_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("endpoint", sa.String(length=128), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("prompt_hash", sa.String(length=64), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cache_key", sa.String(length=64), nullable=True),
        sa.Column("request_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("response_summary", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="success"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ai_usage_logs_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_usage_logs")),
    )
    op.create_index(op.f("ix_ai_usage_logs_cache_key"), "ai_usage_logs", ["cache_key"], unique=False)
    op.create_index(op.f("ix_ai_usage_logs_created_at"), "ai_usage_logs", ["created_at"], unique=False)
    op.create_index(op.f("ix_ai_usage_logs_endpoint"), "ai_usage_logs", ["endpoint"], unique=False)
    op.create_index(
        op.f("ix_ai_usage_logs_prompt_hash"), "ai_usage_logs", ["prompt_hash"], unique=False
    )
    op.create_index(op.f("ix_ai_usage_logs_user_id"), "ai_usage_logs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_usage_logs_user_id"), table_name="ai_usage_logs")
    op.drop_index(op.f("ix_ai_usage_logs_prompt_hash"), table_name="ai_usage_logs")
    op.drop_index(op.f("ix_ai_usage_logs_endpoint"), table_name="ai_usage_logs")
    op.drop_index(op.f("ix_ai_usage_logs_created_at"), table_name="ai_usage_logs")
    op.drop_index(op.f("ix_ai_usage_logs_cache_key"), table_name="ai_usage_logs")
    op.drop_table("ai_usage_logs")

    op.drop_index(
        "ix_inventory_cost_layers_branch_product_variant_received",
        table_name="inventory_cost_layers",
    )
    op.drop_index(op.f("ix_inventory_cost_layers_variant_id"), table_name="inventory_cost_layers")
    op.drop_index(op.f("ix_inventory_cost_layers_source_id"), table_name="inventory_cost_layers")
    op.drop_index(op.f("ix_inventory_cost_layers_product_id"), table_name="inventory_cost_layers")
    op.drop_index(op.f("ix_inventory_cost_layers_branch_id"), table_name="inventory_cost_layers")
    op.drop_table("inventory_cost_layers")

    op.drop_index(
        op.f("ix_production_order_receipts_variant_id"), table_name="production_order_receipts"
    )
    op.drop_index(
        op.f("ix_production_order_receipts_production_order_id"),
        table_name="production_order_receipts",
    )
    op.drop_index(
        op.f("ix_production_order_receipts_product_id"), table_name="production_order_receipts"
    )
    op.drop_index(op.f("ix_production_order_receipts_id"), table_name="production_order_receipts")
    op.drop_table("production_order_receipts")

    op.drop_index(
        op.f("ix_production_order_issues_variant_id"), table_name="production_order_issues"
    )
    op.drop_index(
        op.f("ix_production_order_issues_production_order_id"),
        table_name="production_order_issues",
    )
    op.drop_index(
        op.f("ix_production_order_issues_product_id"), table_name="production_order_issues"
    )
    op.drop_index(op.f("ix_production_order_issues_id"), table_name="production_order_issues")
    op.drop_table("production_order_issues")

    op.drop_index(op.f("ix_production_orders_id"), table_name="production_orders")
    op.drop_index(op.f("ix_production_orders_branch_id"), table_name="production_orders")
    op.drop_index(op.f("ix_production_orders_bom_id"), table_name="production_orders")
    op.drop_table("production_orders")

    op.drop_index(op.f("ix_bom_lines_id"), table_name="bom_lines")
    op.drop_index(op.f("ix_bom_lines_component_product_id"), table_name="bom_lines")
    op.drop_index(op.f("ix_bom_lines_bom_id"), table_name="bom_lines")
    op.drop_table("bom_lines")

    op.drop_index(op.f("ix_bill_of_materials_id"), table_name="bill_of_materials")
    op.drop_index(op.f("ix_bill_of_materials_finished_product_id"), table_name="bill_of_materials")
    op.drop_table("bill_of_materials")
