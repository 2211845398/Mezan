"""Pricing & inventory valuation evaluation matrix for catalog pricing decisions."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import and_, desc, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue
from app.models.category import Category
from app.models.currency import Currency
from app.models.goods_receipt import GoodsReceipt
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.product import Product
from app.models.product_price import ProductPrice
from app.models.product_variant import ProductVariant
from app.models.product_variant_attribute import ProductVariantAttribute
from app.models.stock_level import StockLevel
from app.schemas.pricing_evaluation import (
    FifoLayerRead,
    PricingCommitResponse,
    PricingEvaluationResponse,
    PricingEvaluationRowRead,
    PurchaseHistoryLineRead,
    WavgBreakdownRead,
)
from app.services.accounting_service import get_accounting_settings
from app.services.catalog_service import get_product
from app.services.fifo_valuation_service import get_layers_for_product, get_valuation_policy
from app.services.inventory_valuation_service import get_unit_cost_for_sale
from app.services.pricing_service import get_active_product_price, set_product_sell_price
from app.services.variant_attribute_service import variant_display_label
from app.utils.money import q2

_POLICY_LABELS = {
    "fifo": "FIFO (First-In, First-Out)",
    "wavg": "Weighted Moving Average (AVG)",
}


def _policy_label(policy: str) -> str:
    return _POLICY_LABELS.get(policy, policy.upper())


async def _base_currency_code(db: AsyncSession) -> tuple[int, str]:
    settings = await get_accounting_settings(db)
    res = await db.execute(select(Currency.code).where(Currency.id == settings.base_currency_id))
    code = res.scalar_one_or_none() or "USD"
    return settings.base_currency_id, str(code)


async def _active_branch_ids(db: AsyncSession) -> list[int]:
    res = await db.execute(
        select(Branch.id).where(Branch.is_active.is_(True), Branch.archived_at.is_(None))
    )
    return [int(row[0]) for row in res.all()]


async def _qty_on_hand(
    db: AsyncSession, *, branch_id: int, product_id: int, variant_id: int
) -> int:
    res = await db.execute(
        select(StockLevel.on_hand).where(
            StockLevel.branch_id == branch_id,
            StockLevel.product_id == product_id,
            StockLevel.variant_id == variant_id,
        )
    )
    row = res.scalar_one_or_none()
    return int(row or 0)


async def _last_receipt_line(
    db: AsyncSession, *, branch_id: int, product_id: int, variant_id: int
) -> tuple[GoodsReceiptLine, GoodsReceipt] | None:
    res = await db.execute(
        select(GoodsReceiptLine, GoodsReceipt)
        .join(GoodsReceipt, GoodsReceiptLine.goods_receipt_id == GoodsReceipt.id)
        .where(
            GoodsReceipt.branch_id == branch_id,
            GoodsReceiptLine.product_id == product_id,
            GoodsReceiptLine.variant_id == variant_id,
        )
        .order_by(desc(GoodsReceipt.created_at), desc(GoodsReceiptLine.id))
        .limit(1)
    )
    row = res.first()
    if row is None:
        return None
    return row[0], row[1]


async def _variant_labels_map(db: AsyncSession, variant_ids: list[int]) -> dict[int, list[str]]:
    if not variant_ids:
        return {}
    res = await db.execute(
        select(
            ProductVariantAttribute.variant_id,
            CatalogAttributeValue.label,
        )
        .join(
            CatalogAttributeValue,
            CatalogAttributeValue.id == ProductVariantAttribute.attribute_value_id,
        )
        .join(CatalogAttribute, CatalogAttribute.id == ProductVariantAttribute.attribute_id)
        .where(ProductVariantAttribute.variant_id.in_(variant_ids))
        .order_by(CatalogAttribute.sort_order.asc(), CatalogAttribute.code.asc())
    )
    out: dict[int, list[str]] = {vid: [] for vid in variant_ids}
    for vid, label in res.all():
        out[int(vid)].append(str(label))
    return out


def _build_wavg_breakdown(
    *,
    on_hand: int,
    current_avg: Decimal,
    last_qty: int | None,
    last_cost: Decimal | None,
) -> WavgBreakdownRead | None:
    if last_qty is None or last_cost is None or last_qty <= 0:
        return None

    total_qty = Decimal(max(on_hand, 0))
    new_qty = Decimal(last_qty)
    new_cost = q2(last_cost)
    old_qty = max(total_qty - new_qty, Decimal("0"))

    if old_qty > 0:
        numerator = q2(current_avg * total_qty) - q2(new_cost * new_qty)
        old_cost = q2(numerator / old_qty) if old_qty else current_avg
    else:
        old_cost = current_avg

    blended = current_avg
    formula = f"({old_qty} × {old_cost} + {new_qty} × {new_cost}) / {total_qty or new_qty}"
    return WavgBreakdownRead(
        old_qty=old_qty,
        old_cost=old_cost,
        new_qty=new_qty,
        new_cost=new_cost,
        total_qty=total_qty if total_qty > 0 else new_qty,
        blended_cost=blended,
        formula=formula,
    )


def _product_search_filter(qs: str):
    like = f"%{qs}%"
    variant_match = exists(
        select(ProductVariant.id).where(
            ProductVariant.product_id == Product.id,
            ProductVariant.active.is_(True),
            or_(
                ProductVariant.sku.ilike(like),
                ProductVariant.reference_code.ilike(like),
            ),
        )
    )
    return or_(Product.name.ilike(like), variant_match)


async def _build_evaluation_row(
    db: AsyncSession,
    *,
    product: Product,
    variant: ProductVariant,
    branch_id: int,
    policy: str,
    currency_id: int,
    as_of: datetime,
    label_map: dict[int, list[str]],
) -> PricingEvaluationRowRead:
    on_hand = await _qty_on_hand(
        db, branch_id=branch_id, product_id=product.id, variant_id=variant.id
    )
    system_cost = await get_unit_cost_for_sale(
        db, branch_id=branch_id, product_id=product.id, variant_id=variant.id
    )
    valuation_cost = system_cost if system_cost > 0 else q2(product.standard_cost or Decimal("0"))

    last_pair = await _last_receipt_line(
        db, branch_id=branch_id, product_id=product.id, variant_id=variant.id
    )
    last_cost: Decimal | None = None
    last_qty: int | None = None
    last_at: str | None = None
    if last_pair:
        line, receipt = last_pair
        last_cost = q2(line.unit_cost)
        last_qty = int(line.qty)
        last_at = receipt.created_at.isoformat()

    active_price = await get_active_product_price(
        db,
        product_id=product.id,
        variant_id=variant.id,
        currency_id=currency_id,
        as_of=as_of,
    )
    has_sell = active_price is not None
    current_sell = q2(active_price.amount) if active_price else None

    fifo_layers: list[FifoLayerRead] | None = None
    wavg_breakdown: WavgBreakdownRead | None = None

    if policy == "fifo":
        layers = await get_layers_for_product(
            db, branch_id=branch_id, product_id=product.id, variant_id=variant.id
        )
        fifo_layers = [
            FifoLayerRead(
                layer_index=i + 1,
                qty_remaining=ln.qty_remaining,
                unit_cost=q2(ln.unit_cost),
                received_at=ln.received_at.isoformat(),
                source_type=ln.source_type,
            )
            for i, ln in enumerate(layers)
        ]
    else:
        wavg_breakdown = _build_wavg_breakdown(
            on_hand=on_hand,
            current_avg=valuation_cost,
            last_qty=last_qty,
            last_cost=last_cost,
        )

    labels = label_map.get(variant.id, [])
    variant_label = variant_display_label(product.name, labels) if labels else None
    category: Category = product.category

    return PricingEvaluationRowRead(
        product_id=product.id,
        variant_id=variant.id,
        variant_label=variant_label,
        variant_sku=variant.sku,
        variant_barcode=variant.barcode,
        name=product.name,
        sku=product.sku,
        category_id=category.id,
        category_name=category.name,
        qty_on_hand=on_hand,
        current_system_cost=valuation_cost,
        last_received_cost=last_cost,
        last_received_qty=last_qty,
        last_received_at=last_at,
        current_sell_price=current_sell,
        has_sell_price=has_sell,
        valuation_cost=valuation_cost,
        fifo_layers=fifo_layers,
        wavg_breakdown=wavg_breakdown,
    )


async def _build_evaluation_row_all_branches(
    db: AsyncSession,
    *,
    product: Product,
    variant: ProductVariant,
    policy: str,
    currency_id: int,
    as_of: datetime,
    label_map: dict[int, list[str]],
) -> PricingEvaluationRowRead:
    """One row per variant using highest valuation cost across active branches."""
    branch_ids = await _active_branch_ids(db)
    if not branch_ids:
        raise ValidationError("No active branches", details={})

    best_row: PricingEvaluationRowRead | None = None
    best_cost = Decimal("-1")
    total_qty = 0

    for bid in branch_ids:
        on_hand = await _qty_on_hand(
            db, branch_id=bid, product_id=product.id, variant_id=variant.id
        )
        total_qty += on_hand
        row = await _build_evaluation_row(
            db,
            product=product,
            variant=variant,
            branch_id=bid,
            policy=policy,
            currency_id=currency_id,
            as_of=as_of,
            label_map=label_map,
        )
        cost = q2(row.valuation_cost)
        if cost > best_cost:
            best_cost = cost
            best_row = row

    if best_row is None:
        best_row = await _build_evaluation_row(
            db,
            product=product,
            variant=variant,
            branch_id=branch_ids[0],
            policy=policy,
            currency_id=currency_id,
            as_of=as_of,
            label_map=label_map,
        )

    return best_row.model_copy(update={"qty_on_hand": total_qty})


async def get_pricing_evaluation_matrix(
    db: AsyncSession,
    *,
    branch_id: int | None,
    q: str | None = None,
    needs_pricing_only: bool = True,
    product_id: int | None = None,
    variant_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> PricingEvaluationResponse:
    """Build the pricing evaluation matrix — one row per active variant."""
    policy = await get_valuation_policy(db)
    currency_id, currency_code = await _base_currency_code(db)
    as_of = datetime.now(UTC)

    if product_id is not None and variant_id is not None:
        needs_pricing_only = False

    variant_stmt = (
        select(ProductVariant, Product)
        .join(Product, Product.id == ProductVariant.product_id)
        .options(joinedload(Product.category))
        .where(Product.status == "active", ProductVariant.active.is_(True))
    )

    if product_id is not None:
        variant_stmt = variant_stmt.where(ProductVariant.product_id == product_id)
    if variant_id is not None:
        variant_stmt = variant_stmt.where(ProductVariant.id == variant_id)

    qs = (q or "").strip()
    if qs:
        variant_stmt = variant_stmt.where(_product_search_filter(qs))

    if needs_pricing_only:
        has_variant_price = exists(
            select(ProductPrice.id).where(
                ProductPrice.product_id == ProductVariant.product_id,
                ProductPrice.variant_id == ProductVariant.id,
                ProductPrice.currency_id == currency_id,
                ProductPrice.valid_from <= as_of,
            )
        )
        has_product_price = exists(
            select(ProductPrice.id).where(
                ProductPrice.product_id == ProductVariant.product_id,
                ProductPrice.variant_id.is_(None),
                ProductPrice.currency_id == currency_id,
                ProductPrice.valid_from <= as_of,
            )
        )
        if branch_id is not None:
            in_stock = exists(
                select(StockLevel.id).where(
                    StockLevel.product_id == ProductVariant.product_id,
                    StockLevel.variant_id == ProductVariant.id,
                    StockLevel.branch_id == branch_id,
                    StockLevel.on_hand > 0,
                )
            )
            recent_receipt = exists(
                select(GoodsReceiptLine.id)
                .join(GoodsReceipt, GoodsReceiptLine.goods_receipt_id == GoodsReceipt.id)
                .where(
                    GoodsReceiptLine.product_id == ProductVariant.product_id,
                    GoodsReceiptLine.variant_id == ProductVariant.id,
                    GoodsReceipt.branch_id == branch_id,
                )
            )
        else:
            in_stock = exists(
                select(StockLevel.id).where(
                    StockLevel.product_id == ProductVariant.product_id,
                    StockLevel.variant_id == ProductVariant.id,
                    StockLevel.on_hand > 0,
                )
            )
            recent_receipt = exists(
                select(GoodsReceiptLine.id)
                .join(GoodsReceipt, GoodsReceiptLine.goods_receipt_id == GoodsReceipt.id)
                .where(
                    GoodsReceiptLine.product_id == ProductVariant.product_id,
                    GoodsReceiptLine.variant_id == ProductVariant.id,
                )
            )
        variant_stmt = variant_stmt.where(
            or_(
                and_(~has_variant_price, ~has_product_price),
                and_(in_stock, recent_receipt),
            )
        )

    count_stmt = select(func.count()).select_from(variant_stmt.subquery())
    total = int((await db.execute(count_stmt)).scalar_one())

    variant_stmt = (
        variant_stmt.order_by(Product.name.asc(), ProductVariant.id.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = list((await db.execute(variant_stmt)).all())

    variant_ids = [int(v.id) for v, _ in rows]
    label_map = await _variant_labels_map(db, variant_ids)

    items: list[PricingEvaluationRowRead] = []
    for variant, product in rows:
        if branch_id is not None:
            items.append(
                await _build_evaluation_row(
                    db,
                    product=product,
                    variant=variant,
                    branch_id=branch_id,
                    policy=policy,
                    currency_id=currency_id,
                    as_of=as_of,
                    label_map=label_map,
                )
            )
        else:
            items.append(
                await _build_evaluation_row_all_branches(
                    db,
                    product=product,
                    variant=variant,
                    policy=policy,
                    currency_id=currency_id,
                    as_of=as_of,
                    label_map=label_map,
                )
            )

    return PricingEvaluationResponse(
        valuation_policy=policy,
        valuation_policy_label=_policy_label(policy),
        branch_id=branch_id,
        currency_code=currency_code,
        total=total,
        items=items,
    )


async def list_purchase_history(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int,
    limit: int = 50,
) -> list[PurchaseHistoryLineRead]:
    """Goods receipt lines for a product variant at a branch (newest first)."""
    res = await db.execute(
        select(GoodsReceiptLine, GoodsReceipt)
        .join(GoodsReceipt, GoodsReceiptLine.goods_receipt_id == GoodsReceipt.id)
        .where(
            GoodsReceipt.branch_id == branch_id,
            GoodsReceiptLine.product_id == product_id,
            GoodsReceiptLine.variant_id == variant_id,
        )
        .order_by(desc(GoodsReceipt.created_at), desc(GoodsReceiptLine.id))
        .limit(min(max(limit, 1), 200))
    )
    out: list[PurchaseHistoryLineRead] = []
    for line, receipt in res.all():
        out.append(
            PurchaseHistoryLineRead(
                receipt_id=int(receipt.id),
                received_at=receipt.created_at.isoformat(),
                qty=int(line.qty),
                unit_cost=q2(line.unit_cost),
                supplier_name=receipt.supplier_name,
                invoice_number=receipt.invoice_number,
            )
        )
    return out


async def commit_product_sell_price(
    db: AsyncSession,
    *,
    product_id: int,
    sell_price: Decimal,
    variant_id: int | None = None,
) -> PricingCommitResponse:
    """Persist a new sell price row for the product or a specific variant."""
    if sell_price <= 0:
        raise ValidationError(
            "sell_price must be positive", details={"sell_price": str(sell_price)}
        )

    await get_product(db, product_id)
    currency_id, _ = await _base_currency_code(db)
    price_row = await set_product_sell_price(
        db,
        product_id=product_id,
        variant_id=variant_id,
        amount=q2(sell_price),
        currency_id=currency_id,
    )
    return PricingCommitResponse(
        product_id=product_id,
        variant_id=variant_id,
        sell_price=q2(price_row.amount),
        currency_id=currency_id,
    )
