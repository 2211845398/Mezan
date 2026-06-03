"""Backfill script: Create one product_variant per existing product (Epic 18.4).

This script is idempotent — safe to run multiple times. It will:
1. For each product without a variant, create one variant copying SKU/barcode
2. Update all line tables to reference the new variant_id
3. Skip products that already have variants

Usage:
    uv run python -m app.scripts.backfill_product_variants

Or from within the app:
    from app.scripts.backfill_product_variants import backfill_variants
    await backfill_variants(db)
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.models.branch_product_costs import BranchProductCost
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.pos_cart import PosCartLine
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.sales_invoice import SalesInvoiceLine
from app.models.sales_return import SalesReturnLine
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.models.transfer_line import TransferLine


async def backfill_variants(db: AsyncSession) -> dict[str, Any]:
    """Create variants for all products and update line tables.

    Returns:
        Stats dict with counts of created variants and updated rows per table.
    """
    stats = {
        "variants_created": 0,
        "products_already_with_variants": 0,
        "stock_movements_updated": 0,
        "stock_levels_updated": 0,
        "branch_product_costs_updated": 0,
        "pos_cart_lines_updated": 0,
        "sales_invoice_lines_updated": 0,
        "purchase_order_lines_updated": 0,
        "goods_receipt_lines_updated": 0,
        "transfer_lines_updated": 0,
        "sales_return_lines_updated": 0,
    }

    print("[backfill_variants] Starting backfill...")

    # 1. Get all products and their existing variants
    product_result = await db.execute(select(Product))
    products = product_result.scalars().all()

    variant_result = await db.execute(select(ProductVariant))
    existing_variants = {v.product_id: v for v in variant_result.scalars().all()}

    print(
        f"[backfill_variants] Found {len(products)} products, {len(existing_variants)} already have variants"
    )

    # 2. Create variants for products without one
    product_id_to_variant: dict[int, ProductVariant] = {}
    for product in products:
        if product.id in existing_variants:
            stats["products_already_with_variants"] += 1
            product_id_to_variant[product.id] = existing_variants[product.id]
            continue

        # Create variant copying SKU/barcode from product
        variant = ProductVariant(
            product_id=product.id,
            sku=product.sku,
            barcode=product.barcode,
            attribute_values={},  # Empty - no variant-specific attributes yet
            active=product.status == "active",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(variant)
        product_id_to_variant[product.id] = variant
        stats["variants_created"] += 1

    # Flush to get variant IDs assigned
    if stats["variants_created"] > 0:
        await db.flush()
        print(f"[backfill_variants] Created {stats['variants_created']} new variants")
    else:
        print("[backfill_variants] No new variants needed")

    # Build product_id -> variant_id mapping
    product_to_variant_id = {
        pid: v.id for pid, v in product_id_to_variant.items() if v.id is not None
    }

    if not product_to_variant_id:
        print("[backfill_variants] No variants to link - nothing to update")
        await db.commit()
        return stats

    product_ids = list(product_to_variant_id.keys())
    # Diagnostics: how many rows could get variant_id? (Zeros here = empty DB or no matching lines.)
    eligible = {
        "stock_movements": await db.scalar(
            select(func.count())
            .select_from(StockMovement)
            .where(StockMovement.product_id.in_(product_ids), StockMovement.variant_id.is_(None))
        )
        or 0,
        "stock_levels": await db.scalar(
            select(func.count())
            .select_from(StockLevel)
            .where(StockLevel.product_id.in_(product_ids), StockLevel.variant_id.is_(None))
        )
        or 0,
        "branch_product_costs": await db.scalar(
            select(func.count())
            .select_from(BranchProductCost)
            .where(
                BranchProductCost.product_id.in_(product_ids),
                BranchProductCost.variant_id.is_(None),
            )
        )
        or 0,
        "pos_cart_lines": await db.scalar(
            select(func.count())
            .select_from(PosCartLine)
            .where(PosCartLine.product_id.in_(product_ids), PosCartLine.variant_id.is_(None))
        )
        or 0,
        "sales_invoice_lines": await db.scalar(
            select(func.count())
            .select_from(SalesInvoiceLine)
            .where(
                SalesInvoiceLine.product_id.in_(product_ids),
                SalesInvoiceLine.variant_id.is_(None),
            )
        )
        or 0,
        "purchase_order_lines": await db.scalar(
            select(func.count())
            .select_from(PurchaseOrderLine)
            .where(
                PurchaseOrderLine.product_id.in_(product_ids),
                PurchaseOrderLine.variant_id.is_(None),
            )
        )
        or 0,
        "goods_receipt_lines": await db.scalar(
            select(func.count())
            .select_from(GoodsReceiptLine)
            .where(
                GoodsReceiptLine.product_id.in_(product_ids),
                GoodsReceiptLine.variant_id.is_(None),
            )
        )
        or 0,
        "transfer_lines": await db.scalar(
            select(func.count())
            .select_from(TransferLine)
            .where(TransferLine.product_id.in_(product_ids), TransferLine.variant_id.is_(None))
        )
        or 0,
        "sales_return_lines": await db.scalar(
            select(func.count())
            .select_from(SalesReturnLine)
            .where(
                SalesReturnLine.product_id.in_(product_ids),
                SalesReturnLine.variant_id.is_(None),
            )
        )
        or 0,
    }
    print(
        "[backfill_variants] Eligible rows (product_id in scope, variant_id IS NULL): "
        + ", ".join(f"{k}={v}" for k, v in eligible.items())
    )
    if sum(eligible.values()) == 0:
        print(
            "[backfill_variants] Note: 0 eligible rows is normal on a fresh DB "
            "with products but no stock/sales/purchase lines yet."
        )
    for k, v in eligible.items():
        stats[f"eligible_{k}"] = v

    # 3. Update all line tables to reference the variant (per product_id).
    # Each update only affects rows where variant_id IS NULL (idempotent).
    # We loop per product because .values() cannot use a Python dict keyed by ORM columns.

    for product_id, variant_id in product_to_variant_id.items():
        # Stock movements
        sm_result = await db.execute(
            update(StockMovement)
            .where(
                StockMovement.product_id == product_id,
                StockMovement.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["stock_movements_updated"] += sm_result.rowcount or 0

        sl_result = await db.execute(
            update(StockLevel)
            .where(
                StockLevel.product_id == product_id,
                StockLevel.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["stock_levels_updated"] += sl_result.rowcount or 0

        bpc_result = await db.execute(
            update(BranchProductCost)
            .where(
                BranchProductCost.product_id == product_id,
                BranchProductCost.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["branch_product_costs_updated"] += bpc_result.rowcount or 0

        pcl_result = await db.execute(
            update(PosCartLine)
            .where(
                PosCartLine.product_id == product_id,
                PosCartLine.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["pos_cart_lines_updated"] += pcl_result.rowcount or 0

        sil_result = await db.execute(
            update(SalesInvoiceLine)
            .where(
                SalesInvoiceLine.product_id == product_id,
                SalesInvoiceLine.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["sales_invoice_lines_updated"] += sil_result.rowcount or 0

        pol_result = await db.execute(
            update(PurchaseOrderLine)
            .where(
                PurchaseOrderLine.product_id == product_id,
                PurchaseOrderLine.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["purchase_order_lines_updated"] += pol_result.rowcount or 0

        grl_result = await db.execute(
            update(GoodsReceiptLine)
            .where(
                GoodsReceiptLine.product_id == product_id,
                GoodsReceiptLine.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["goods_receipt_lines_updated"] += grl_result.rowcount or 0

        tl_result = await db.execute(
            update(TransferLine)
            .where(
                TransferLine.product_id == product_id,
                TransferLine.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["transfer_lines_updated"] += tl_result.rowcount or 0

        srl_result = await db.execute(
            update(SalesReturnLine)
            .where(
                SalesReturnLine.product_id == product_id,
                SalesReturnLine.variant_id.is_(None),
            )
            .values(variant_id=variant_id)
            .execution_options(synchronize_session=False)
        )
        stats["sales_return_lines_updated"] += srl_result.rowcount or 0

    print(f"[backfill_variants] Updated {stats['stock_movements_updated']} stock_movements")
    print(f"[backfill_variants] Updated {stats['stock_levels_updated']} stock_levels")
    print(
        f"[backfill_variants] Updated {stats['branch_product_costs_updated']} branch_product_costs"
    )
    print(f"[backfill_variants] Updated {stats['pos_cart_lines_updated']} pos_cart_lines")
    print(f"[backfill_variants] Updated {stats['sales_invoice_lines_updated']} sales_invoice_lines")
    print(
        f"[backfill_variants] Updated {stats['purchase_order_lines_updated']} purchase_order_lines"
    )
    print(f"[backfill_variants] Updated {stats['goods_receipt_lines_updated']} goods_receipt_lines")
    print(f"[backfill_variants] Updated {stats['transfer_lines_updated']} transfer_lines")
    print(f"[backfill_variants] Updated {stats['sales_return_lines_updated']} sales_return_lines")

    # Commit all changes
    await db.commit()

    print("[backfill_variants] Backfill complete!")
    print(f"[backfill_variants] Stats: {stats}")

    return stats


async def main() -> None:
    """CLI entry point for running the backfill script."""
    async with AsyncSessionLocal() as db:
        stats = await backfill_variants(db)
        print("\n=== Backfill Summary ===")
        for key, value in stats.items():
            print(f"  {key}: {value}")


if __name__ == "__main__":
    asyncio.run(main())
