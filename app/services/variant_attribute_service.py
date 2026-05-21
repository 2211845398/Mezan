"""Variant generation, pivot sync, and attribute-axis validation."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.errors import ConflictError, NotFoundError, ValidationError
from decimal import Decimal

from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue
from app.models.product import Product
from app.models.product_attribute_line import ProductAttributeLine
from app.models.product_attribute_line_value import ProductAttributeLineValue
from app.models.product_variant import ProductVariant
from app.models.product_variant_attribute import ProductVariantAttribute
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.schemas.variant_generation import (
    AttributeSummaryItem,
    ProductAxisLineRead,
    ProductVariantDetailRead,
    ProductWithVariantsRead,
    VariantPreviewRequest,
    VariantPreviewResponse,
    VariantPreviewRow,
    VariantSyncRequest,
    VariantSyncResponse,
    VariantSyncRow,
)
from app.services.catalog_service import get_product, product_to_read
from app.utils.variant_combination_key import build_combination_key
from app.utils.variant_combinator import cartesian_product_combos


async def validate_catalog_axes(
    db: AsyncSession,
    axes: dict[int, list[int]],
) -> tuple[list[int], dict[int, CatalogAttributeValue]]:
    """Validate variant axes against the global catalog attribute dictionary only."""
    if not axes:
        return [], {}

    attr_ids = list(axes.keys())
    attr_res = await db.execute(
        select(CatalogAttribute.id).where(CatalogAttribute.id.in_(attr_ids))
    )
    found_attrs = {int(aid) for aid in attr_res.scalars().all()}
    unknown_attrs = set(attr_ids) - found_attrs
    if unknown_attrs:
        raise ValidationError(
            "Unknown catalog attribute ids",
            details={"attribute_ids": sorted(unknown_attrs)},
        )

    all_value_ids: list[int] = []
    for vals in axes.values():
        if not vals:
            raise ValidationError(
                "Each variant axis must have at least one value",
                details={},
            )
        all_value_ids.extend(vals)

    res = await db.execute(
        select(CatalogAttributeValue).where(CatalogAttributeValue.id.in_(all_value_ids))
    )
    value_rows = {int(r.id): r for r in res.scalars().all()}
    missing = set(all_value_ids) - set(value_rows.keys())
    if missing:
        raise ValidationError(
            "Unknown attribute value ids",
            details={"attribute_value_ids": sorted(missing)},
        )

    for attr_id, val_ids in axes.items():
        seen: set[int] = set()
        for vid in val_ids:
            if vid in seen:
                raise ValidationError(
                    "Duplicate value on same axis",
                    details={"attribute_id": attr_id, "attribute_value_id": vid},
                )
            seen.add(vid)
            row = value_rows[vid]
            if int(row.attribute_id) != int(attr_id):
                raise ValidationError(
                    "Value does not belong to attribute",
                    details={
                        "attribute_id": attr_id,
                        "attribute_value_id": vid,
                        "actual_attribute_id": row.attribute_id,
                    },
                )

    attr_order_res = await db.execute(
        select(CatalogAttribute.id, CatalogAttribute.sort_order).where(
            CatalogAttribute.id.in_(attr_ids)
        )
    )
    attr_sort = {int(aid): int(so) for aid, so in attr_order_res.all()}
    order = sorted(axes.keys(), key=lambda aid: (attr_sort.get(aid, 0), aid))
    return order, value_rows


def build_variant_sku(product_sku: str, value_codes: list[str]) -> str:
    parts = [product_sku.strip()]
    for code in value_codes:
        c = (code or "").strip().upper()
        if c:
            parts.append(c)
    return "-".join(parts)


def variant_display_label(product_name: str, labels: list[str]) -> str:
    parts = [product_name.strip()] + [lb.strip() for lb in labels if lb and lb.strip()]
    return " — ".join(parts)


async def _attribute_summary_for_value_ids(
    db: AsyncSession, value_ids: list[int]
) -> list[AttributeSummaryItem]:
    if not value_ids:
        return []
    res = await db.execute(
        select(CatalogAttributeValue, CatalogAttribute)
        .join(CatalogAttribute, CatalogAttribute.id == CatalogAttributeValue.attribute_id)
        .where(CatalogAttributeValue.id.in_(value_ids))
    )
    rows = res.all()
    by_vid = {
        int(v.id): AttributeSummaryItem(
            attribute_id=int(a.id),
            attribute_value_id=int(v.id),
            attribute_code=a.code,
            value_code=v.code,
            label=v.label,
        )
        for v, a in rows
    }
    return [by_vid[vid] for vid in value_ids if vid in by_vid]


async def sync_variant_jsonb_cache(db: AsyncSession, variant_id: int) -> dict[str, str]:
    """Rebuild denormalized JSONB from pivot (backward compatibility)."""
    res = await db.execute(
        select(ProductVariantAttribute, CatalogAttribute, CatalogAttributeValue)
        .join(CatalogAttribute, CatalogAttribute.id == ProductVariantAttribute.attribute_id)
        .join(
            CatalogAttributeValue,
            CatalogAttributeValue.id == ProductVariantAttribute.attribute_value_id,
        )
        .where(ProductVariantAttribute.variant_id == variant_id)
        .order_by(CatalogAttribute.sort_order.asc(), CatalogAttribute.code.asc())
    )
    cache: dict[str, str] = {}
    for _pva, attr, val in res.all():
        cache[attr.code] = val.label
    pv_res = await db.execute(select(ProductVariant).where(ProductVariant.id == variant_id))
    pv = pv_res.scalar_one_or_none()
    if pv:
        pv.attribute_values = cache
        pv.updated_at = datetime.now(UTC)
        await db.flush()
    return cache


async def sync_product_attribute_lines(
    db: AsyncSession,
    *,
    product_id: int,
    axes: dict[int, list[int]],
) -> list[ProductAxisLineRead]:
    """Persist Odoo-style template attribute lines for a product."""
    await get_product(db, product_id)
    order, value_rows = await validate_catalog_axes(db, axes)

    await db.execute(
        delete(ProductAttributeLine).where(ProductAttributeLine.product_id == product_id)
    )
    await db.flush()

    now = datetime.now(UTC)
    out: list[ProductAxisLineRead] = []
    for sort_idx, attr_id in enumerate(order):
        val_ids = axes[attr_id]
        attr_res = await db.execute(
            select(CatalogAttribute).where(CatalogAttribute.id == attr_id)
        )
        attr = attr_res.scalar_one()
        line = ProductAttributeLine(
            product_id=product_id,
            attribute_id=attr_id,
            sort_order=sort_idx,
            created_at=now,
            updated_at=now,
        )
        db.add(line)
        await db.flush()
        for vid in val_ids:
            db.add(
                ProductAttributeLineValue(
                    line_id=int(line.id),
                    attribute_value_id=int(vid),
                    created_at=now,
                )
            )
        out.append(
            ProductAxisLineRead(
                attribute_id=attr_id,
                attribute_code=attr.code,
                attribute_name=attr.name,
                sort_order=sort_idx,
                value_ids=list(val_ids),
            )
        )
    await db.flush()
    return out


async def load_product_attribute_axes(
    db: AsyncSession, product_id: int
) -> list[ProductAxisLineRead]:
    """Load saved template axes for a product."""
    res = await db.execute(
        select(ProductAttributeLine, CatalogAttribute)
        .join(CatalogAttribute, CatalogAttribute.id == ProductAttributeLine.attribute_id)
        .where(ProductAttributeLine.product_id == product_id)
        .order_by(ProductAttributeLine.sort_order.asc(), ProductAttributeLine.id.asc())
    )
    out: list[ProductAxisLineRead] = []
    for line, attr in res.all():
        val_res = await db.execute(
            select(ProductAttributeLineValue.attribute_value_id)
            .where(ProductAttributeLineValue.line_id == line.id)
            .order_by(ProductAttributeLineValue.attribute_value_id.asc())
        )
        value_ids = [int(v) for v in val_res.scalars().all()]
        out.append(
            ProductAxisLineRead(
                attribute_id=int(attr.id),
                attribute_code=attr.code,
                attribute_name=attr.name,
                sort_order=int(line.sort_order),
                value_ids=value_ids,
            )
        )
    return out


async def _existing_variant_value_sets(
    db: AsyncSession, product_id: int
) -> dict[int, frozenset[int]]:
    res = await db.execute(
        select(ProductVariant.id)
        .where(ProductVariant.product_id == product_id)
    )
    variant_ids = [int(v) for v in res.scalars().all()]
    if not variant_ids:
        return {}
    pva_res = await db.execute(
        select(ProductVariantAttribute.variant_id, ProductVariantAttribute.attribute_value_id)
        .where(ProductVariantAttribute.variant_id.in_(variant_ids))
    )
    buckets: dict[int, set[int]] = {vid: set() for vid in variant_ids}
    for vid, val_id in pva_res.all():
        buckets[int(vid)].add(int(val_id))
    return {vid: frozenset(vals) for vid, vals in buckets.items()}


async def preview_generate_variants(
    db: AsyncSession,
    *,
    product_id: int,
    body: VariantPreviewRequest,
) -> VariantPreviewResponse:
    product = await get_product(db, product_id)
    order, value_rows = await validate_catalog_axes(db, body.axes)
    combos = cartesian_product_combos(body.axes, attribute_order=order)
    existing_sets = set((await _existing_variant_value_sets(db, product_id)).values())

    rows: list[VariantPreviewRow] = []
    for combo in combos:
        value_ids = list(combo)
        summary = await _attribute_summary_for_value_ids(db, value_ids)
        summary_sorted = sorted(summary, key=lambda s: (s.attribute_code, s.value_code))
        codes = [s.value_code for s in summary_sorted]
        labels = [s.label for s in summary_sorted]
        suggested = build_variant_sku(product.sku, codes)
        display = variant_display_label(product.name, labels)
        rows.append(
            VariantPreviewRow(
                attribute_value_ids=value_ids,
                suggested_sku=suggested,
                display_label=display,
                exists=frozenset(value_ids) in existing_sets,
                attribute_summary=summary_sorted,
            )
        )
    return VariantPreviewResponse(rows=rows, count=len(rows))


async def _variant_has_inventory_activity(db: AsyncSession, variant_id: int) -> bool:
    """True if variant has on-hand stock or any inventory movement history."""
    res = await db.execute(
        select(func.coalesce(func.sum(StockLevel.on_hand), 0)).where(
            StockLevel.variant_id == variant_id
        )
    )
    total = res.scalar_one()
    if total is not None and total > 0:
        return True
    mov_res = await db.execute(
        select(exists().where(StockMovement.variant_id == variant_id))
    )
    return bool(mov_res.scalar_one())


async def _variant_display_label_for_conflict(
    db: AsyncSession,
    *,
    product: Product,
    variant: ProductVariant,
    value_ids: frozenset[int],
) -> str:
    if value_ids:
        summary = await _attribute_summary_for_value_ids(db, sorted(value_ids))
        labels = [s.label for s in sorted(summary, key=lambda s: (s.attribute_code, s.value_code))]
        return variant_display_label(product.name, labels)
    return variant.sku.strip() or product.name.strip()


async def _replace_variant_pivot(
    db: AsyncSession,
    *,
    variant_id: int,
    value_ids: list[int],
    value_rows: dict[int, CatalogAttributeValue],
) -> None:
    await db.execute(
        delete(ProductVariantAttribute).where(ProductVariantAttribute.variant_id == variant_id)
    )
    for vid in value_ids:
        val = value_rows[vid]
        db.add(
            ProductVariantAttribute(
                variant_id=variant_id,
                attribute_id=int(val.attribute_id),
                attribute_value_id=int(val.id),
            )
        )
    await db.flush()
    await sync_variant_jsonb_cache(db, variant_id)


async def sync_product_variant_configuration(
    db: AsyncSession,
    *,
    product_id: int,
    body: VariantSyncRequest,
) -> VariantSyncResponse:
    """Persist template axes (optional) then sync variant rows."""
    if body.axes is not None:
        await sync_product_attribute_lines(db, product_id=product_id, axes=body.axes)
    return await sync_product_variants(db, product_id=product_id, body=body)


async def sync_product_variants(
    db: AsyncSession,
    *,
    product_id: int,
    body: VariantSyncRequest,
) -> VariantSyncResponse:
    from app.utils.money import to_decimal as _to_decimal

    product = await get_product(db, product_id)
    now = datetime.now(UTC)

    if not body.variants:
        from app.services.catalog_service import _ensure_default_product_variant

        await _ensure_default_product_variant(db, product)
        await db.flush()
        res = await db.execute(
            select(ProductVariant.id).where(ProductVariant.product_id == product_id)
        )
        ids = [int(i) for i in res.scalars().all()]
        return VariantSyncResponse(created=0, updated=0, deactivated=0, variant_ids=ids)

    all_value_ids: list[int] = []
    for row in body.variants:
        all_value_ids.extend(row.attribute_value_ids)

    value_rows: dict[int, CatalogAttributeValue] = {}
    if all_value_ids:
        axes_for_validation: dict[int, list[int]] = {}
        res = await db.execute(
            select(CatalogAttributeValue).where(CatalogAttributeValue.id.in_(all_value_ids))
        )
        for r in res.scalars().all():
            value_rows[int(r.id)] = r
            axes_for_validation.setdefault(int(r.attribute_id), [])
            if int(r.id) not in axes_for_validation[int(r.attribute_id)]:
                axes_for_validation[int(r.attribute_id)].append(int(r.id))
        await validate_catalog_axes(db, axes_for_validation)

    existing_res = await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product_id)
    )
    by_id: dict[int, ProductVariant] = {int(v.id): v for v in existing_res.scalars().all()}
    existing_sets = await _existing_variant_value_sets(db, product_id)
    set_to_vid: dict[frozenset[int], int] = {
        s: vid for vid, s in existing_sets.items() if s
    }

    requested_sets: dict[frozenset[int], VariantSyncRow] = {}
    for row in body.variants:
        key = frozenset(row.attribute_value_ids)
        if key in requested_sets:
            raise ValidationError("Duplicate variant combination in request", details={})
        requested_sets[key] = row

    created = updated = deactivated = 0
    touched_ids: list[int] = []

    async def apply_row(pv: ProductVariant, sync_row: VariantSyncRow, key: frozenset[int]) -> None:
        nonlocal updated
        old_set = existing_sets.get(int(pv.id), frozenset())
        if old_set != key and await _variant_has_inventory_activity(db, int(pv.id)):
            display = await _variant_display_label_for_conflict(
                db, product=product, variant=pv, value_ids=old_set
            )
            raise ConflictError(
                "Cannot change variant linked to inventory activity",
                details={"variant_id": pv.id, "display_label": display},
            )
        pv.sku = sync_row.sku.strip()
        pv.barcode = (sync_row.barcode or "").strip() or None
        pv.active = sync_row.active
        pv.price_extra = _to_decimal(sync_row.price_extra)
        pv.combination_key = build_combination_key(key)
        pv.updated_at = now
        if key:
            await _replace_variant_pivot(
                db, variant_id=int(pv.id), value_ids=sorted(key), value_rows=value_rows
            )
        updated += 1
        touched_ids.append(int(pv.id))

    for key, sync_row in requested_sets.items():
        if sync_row.id is not None:
            pv = by_id.get(sync_row.id)
            if not pv:
                raise NotFoundError("Variant not found", details={"variant_id": sync_row.id})
            await apply_row(pv, sync_row, key)
            set_to_vid[key] = int(pv.id)
            continue

        if key in set_to_vid:
            pv = by_id[set_to_vid[key]]
            await apply_row(pv, sync_row, key)
            continue

        pv = ProductVariant(
            product_id=product_id,
            sku=sync_row.sku.strip(),
            barcode=(sync_row.barcode or "").strip() or None,
            combination_key=build_combination_key(key),
            price_extra=_to_decimal(sync_row.price_extra),
            attribute_values={},
            active=sync_row.active,
            created_at=now,
            updated_at=now,
        )
        db.add(pv)
        try:
            await db.flush()
        except IntegrityError as e:
            raise ConflictError(
                "Variant SKU or barcode conflicts with existing data",
                details={"sku": sync_row.sku},
            ) from e
        if key:
            await _replace_variant_pivot(
                db, variant_id=int(pv.id), value_ids=sorted(key), value_rows=value_rows
            )
        else:
            pv.attribute_values = {"_default": True}
            pv.combination_key = build_combination_key(None)
        created += 1
        touched_ids.append(int(pv.id))
        set_to_vid[key] = int(pv.id)
        by_id[int(pv.id)] = pv
        existing_sets[int(pv.id)] = key

    for vid, pv in by_id.items():
        if vid in touched_ids:
            continue
        pv_set = existing_sets.get(vid, frozenset())
        if pv_set in requested_sets:
            continue
        is_default = bool(pv.attribute_values.get("_default")) and not pv_set
        if is_default and requested_sets:
            pv.active = False
            pv.updated_at = now
            deactivated += 1
            continue
        if await _variant_has_inventory_activity(db, vid):
            display = await _variant_display_label_for_conflict(
                db, product=product, variant=pv, value_ids=pv_set
            )
            raise ConflictError(
                "Cannot deactivate variant linked to inventory activity",
                details={"variant_id": vid, "display_label": display},
            )
        pv.active = False
        pv.updated_at = now
        deactivated += 1

    await db.flush()
    return VariantSyncResponse(
        created=created,
        updated=updated,
        deactivated=deactivated,
        variant_ids=sorted(set(touched_ids)),
    )


async def get_product_with_variants(
    db: AsyncSession, product_id: int
) -> ProductWithVariantsRead:
    """Product template detail with saved axes and variant rows."""
    from app.core.errors import ValidationError as AppValidationError
    from app.models.branch_product_costs import BranchProductCost
    from app.services.pricing_service import get_active_sell_price

    product = await get_product(db, product_id)
    base_read = await product_to_read(db, product)
    axes = await load_product_attribute_axes(db, product_id)

    try:
        product_sell_price = await get_active_sell_price(db, product_id=product_id)
    except AppValidationError:
        product_sell_price = None

    variants_res = await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product_id)
    )
    variants = variants_res.scalars().all()
    variant_ids = [int(v.id) for v in variants]
    pva_map: dict[int, list[int]] = {vid: [] for vid in variant_ids}
    if variant_ids:
        pva_res = await db.execute(
            select(
                ProductVariantAttribute.variant_id,
                ProductVariantAttribute.attribute_value_id,
            ).where(ProductVariantAttribute.variant_id.in_(variant_ids))
        )
        for vid, val_id in pva_res.all():
            pva_map[int(vid)].append(int(val_id))

    variants_data: list[ProductVariantDetailRead] = []
    for v in variants:
        value_ids = sorted(pva_map.get(int(v.id), []))
        if value_ids:
            summary = await _attribute_summary_for_value_ids(db, value_ids)
            labels = [s.label for s in sorted(summary, key=lambda s: (s.attribute_code, s.value_code))]
            display = variant_display_label(product.name, labels)
        else:
            display = v.sku.strip() or product.name.strip()

        stock_res = await db.execute(select(StockLevel).where(StockLevel.variant_id == v.id))
        stock_levels = stock_res.scalars().all()
        stock_by_branch = {int(s.branch_id): s.on_hand for s in stock_levels}

        cost_res = await db.execute(
            select(BranchProductCost).where(BranchProductCost.variant_id == v.id)
        )
        costs = cost_res.scalars().all()
        cost_by_branch = {int(c.branch_id): c.average_unit_cost for c in costs}

        variants_data.append(
            ProductVariantDetailRead(
                id=int(v.id),
                sku=v.sku,
                barcode=v.barcode,
                attribute_values=v.attribute_values or {},
                attribute_value_ids=value_ids,
                active=bool(v.active),
                price_extra=Decimal(str(v.price_extra)),
                display_label=display,
                combination_key=v.combination_key,
                stock_by_branch=stock_by_branch,
                last_cost_by_branch=cost_by_branch,
                sell_price=product_sell_price,
            )
        )

    return ProductWithVariantsRead(
        product=base_read.model_dump(),
        axes=axes,
        variants=variants_data,
        variant_count=len(variants_data),
    )


async def filter_variants_by_attribute_value(
    db: AsyncSession,
    *,
    attribute_id: int | None = None,
    attribute_value_id: int | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ProductVariant]:
    stmt = select(ProductVariant).where(ProductVariant.active.is_(True))
    if attribute_value_id is not None:
        stmt = stmt.where(
            exists().where(
                ProductVariantAttribute.variant_id == ProductVariant.id,
                ProductVariantAttribute.attribute_value_id == attribute_value_id,
            )
        )
    elif attribute_id is not None:
        stmt = stmt.where(
            exists().where(
                ProductVariantAttribute.variant_id == ProductVariant.id,
                ProductVariantAttribute.attribute_id == attribute_id,
            )
        )
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.join(Product, Product.id == ProductVariant.product_id).where(
            ProductVariant.sku.ilike(like) | Product.name.ilike(like)
        )
    stmt = stmt.order_by(ProductVariant.id.asc()).limit(limit).offset(offset)
    res = await db.execute(stmt)
    return list(res.scalars().all())
