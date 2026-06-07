"""Catalog service: categories, dynamic attribute definitions, products, barcodes."""

from __future__ import annotations

import asyncio
import secrets
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import Select, and_, case, delete, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, ValidationError, validation_error
from app.models.category import Category
from app.models.product import Product
from app.models.product_category import ProductCategory
from app.models.product_tax_definition import ProductTaxDefinition
from app.models.product_unit_conversion import ProductUnitConversion
from app.models.product_variant import ProductVariant
from app.models.stock_level import StockLevel
from app.models.tax_definition import TaxDefinition
from app.models.unit_of_measure import UnitOfMeasure
from app.schemas.catalog import (
    CategoryTreeNode,
    ProductAlternativeUomRead,
    ProductRead,
    ProductVariantPurchasingSearchItem,
    UnitOfMeasureRead,
)
from app.services.pricing_service import set_product_sell_price
from app.utils.image_format import detect_raster_image_extension
from app.utils.money import to_decimal
from app.utils.smart_sku import (
    category_slug_to_prefix,
    format_product_sku,
    validate_sku_reference,
)
from app.utils.variant_display import (
    variant_attributes_summary,
    variant_value_labels_summary,
)

_UNSET = object()


def _ean13_checksum(d12: str) -> str:
    if len(d12) != 12 or not d12.isdigit():
        raise ValueError("EAN-13 requires 12 digits to compute checksum")
    s = 0
    for i, ch in enumerate(d12):
        n = int(ch)
        s += n if (i % 2 == 0) else 3 * n
    return str((10 - (s % 10)) % 10)


def _make_internal_ean13_from_product_id(product_id: int) -> str:
    # 200-299 are commonly used for internal store codes.
    base = f"200{product_id:09d}"  # 12 digits
    return base + _ean13_checksum(base)


def _make_internal_ean13_from_variant_id(variant_id: int) -> str:
    """Internal EAN-13 for a stock-keeping variant (prefix 201)."""
    base = f"201{variant_id:09d}"
    return base + _ean13_checksum(base)


def assign_variant_barcode_if_missing(variant: ProductVariant) -> bool:
    """Set variant barcode from id when empty. Returns True if assigned."""
    if not _barcode_unset(variant.barcode):
        return False
    if variant.id is None:
        return False
    variant.barcode = _make_internal_ean13_from_variant_id(int(variant.id))
    return True


def _barcode_unset(v: str | None) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


async def get_category(db: AsyncSession, category_id: int) -> Category:
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise NotFoundError("Category not found", details={"category_id": category_id})
    return category


async def list_categories(db: AsyncSession, *, parent_id: int | None = None) -> list[Category]:
    q = select(Category)
    if parent_id is None:
        q = q.where(Category.parent_id.is_(None))
    else:
        q = q.where(Category.parent_id == parent_id)
    q = q.order_by(Category.sort_order.asc(), Category.name.asc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def list_all_categories(db: AsyncSession) -> list[Category]:
    result = await db.execute(
        select(Category).order_by(Category.sort_order.asc(), Category.name.asc())
    )
    return list(result.scalars().all())


def build_category_tree_nodes(
    categories: Iterable[Category],
    *,
    direct_product_counts: dict[int, int] | None = None,
) -> list[CategoryTreeNode]:
    """Build nested tree DTOs without touching ORM ``children`` (mapped relationship).

    Mutating ``Category.children`` with ``setattr`` triggers implicit loads under
    ``AsyncSession`` and can raise ``MissingGreenlet``.
    """
    cat_list = list(categories)
    by_parent: dict[int | None, list[Category]] = {}
    for c in cat_list:
        by_parent.setdefault(c.parent_id, []).append(c)
    for sibs in by_parent.values():
        sibs.sort(key=lambda x: (x.sort_order, x.name))

    def to_node(c: Category) -> CategoryTreeNode:
        kids = by_parent.get(c.id, [])
        cnt = int(direct_product_counts.get(c.id, 0)) if direct_product_counts is not None else 0
        return CategoryTreeNode(
            id=c.id,
            name=c.name,
            slug=c.slug,
            sort_order=c.sort_order,
            is_active=c.is_active,
            parent_id=c.parent_id,
            created_at=c.created_at,
            updated_at=c.updated_at,
            image_url=c.image_url,
            children=[to_node(ch) for ch in kids],
            direct_product_count=cnt,
        )

    return [to_node(r) for r in by_parent.get(None, [])]


async def count_products_by_primary_category(db: AsyncSession) -> dict[int, int]:
    result = await db.execute(
        select(Product.category_id, func.count()).group_by(Product.category_id)
    )
    return {int(cid): int(n) for cid, n in result.all()}


async def list_category_tree(db: AsyncSession) -> list[CategoryTreeNode]:
    cats = await list_all_categories(db)
    counts = await count_products_by_primary_category(db)
    return build_category_tree_nodes(cats, direct_product_counts=counts)


async def _get_category_depth(db: AsyncSession, category_id: int | None) -> int:
    """Calculate depth of category (0 = root, 1 = first child, etc.)."""
    if category_id is None:
        return 0
    depth = 0
    current_id = category_id
    visited: set[int] = set()
    while current_id is not None and current_id not in visited:
        visited.add(current_id)
        depth += 1
        res = await db.execute(select(Category).where(Category.id == current_id))
        cat = res.scalar_one_or_none()
        if not cat:
            break
        current_id = cat.parent_id
    return depth


MAX_CATEGORY_DEPTH = 4


async def create_category(db: AsyncSession, *, data: dict[str, Any]) -> Category:
    """Create category with depth validation (Epic 18.6: max 4 levels)."""
    parent_id = data.get("parent_id")
    if parent_id is not None:
        await get_category(db, parent_id)
        # Epic 18.6: Check depth limit
        parent_depth = await _get_category_depth(db, parent_id)
        if parent_depth >= MAX_CATEGORY_DEPTH:
            raise ValidationError(
                f"Maximum category depth is {MAX_CATEGORY_DEPTH} levels",
                details={"parent_depth": parent_depth, "max_depth": MAX_CATEGORY_DEPTH},
            )
    category = Category(**data)
    db.add(category)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Category already exists", details={"error": str(e.orig)}) from e
    await db.refresh(category)
    return category


async def update_category(db: AsyncSession, *, category_id: int, data: dict[str, Any]) -> Category:
    """Update category with depth validation (Epic 18.6: max 4 levels)."""
    category = await get_category(db, category_id)
    if "parent_id" in data:
        new_parent_id = data["parent_id"]
        if new_parent_id == category_id:
            raise ValidationError("Category cannot be its own parent")
        if new_parent_id is not None:
            await get_category(db, new_parent_id)
            # Epic 18.6: Check depth limit when reparenting
            parent_depth = await _get_category_depth(db, new_parent_id)
            # Add 1 for this category itself
            if parent_depth + 1 > MAX_CATEGORY_DEPTH:
                raise ValidationError(
                    f"Maximum category depth is {MAX_CATEGORY_DEPTH} levels",
                    details={"parent_depth": parent_depth, "max_depth": MAX_CATEGORY_DEPTH},
                )
    for k, v in data.items():
        setattr(category, k, v)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Category update conflicts with existing data") from e
    await db.refresh(category)
    return category


async def delete_category(db: AsyncSession, *, category_id: int) -> None:
    category = await get_category(db, category_id)
    await db.delete(category)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Cannot delete category with existing references") from e


def _normalize_sell_price(raw_value: Any) -> Decimal:
    try:
        sell_price = to_decimal(raw_value)
    except ValueError as exc:
        raise ValidationError(
            "سعر البيع غير صالح لهذا المنتج",
            details={"code": "product_invalid_sellable_price"},
        ) from exc
    if sell_price <= Decimal("0.00"):
        validation_error("product_no_sellable_price", "المنتج ليس له سعر بيع محدد")
    return sell_price


async def _category_descendant_ids(db: AsyncSession, root_id: int) -> set[int]:
    all_cats = await list_all_categories(db)
    by_parent: dict[int | None, list[int]] = {}
    for c in all_cats:
        by_parent.setdefault(c.parent_id, []).append(c.id)
    found: set[int] = {root_id}
    stack = [root_id]
    while stack:
        pid = stack.pop()
        for cid in by_parent.get(pid, []):
            if cid not in found:
                found.add(cid)
                stack.append(cid)
    return found


async def _product_tag_map(db: AsyncSession, product_ids: list[int]) -> dict[int, list[int]]:
    if not product_ids:
        return {}
    result = await db.execute(
        select(ProductCategory.product_id, ProductCategory.category_id).where(
            ProductCategory.product_id.in_(product_ids)
        )
    )
    out: dict[int, list[int]] = {int(pid): [] for pid in product_ids}
    for pid, cid in result.all():
        out.setdefault(int(pid), []).append(int(cid))
    return out


async def _ensure_category_ids_exist(db: AsyncSession, ids: set[int]) -> None:
    if not ids:
        return
    result = await db.execute(select(Category.id).where(Category.id.in_(list(ids))))
    found = {int(r) for r in result.scalars().all()}
    missing = sorted(ids - found)
    if missing:
        raise ValidationError("Unknown category_id", details={"category_ids": missing})


async def sync_product_category_links(
    db: AsyncSession,
    *,
    product_id: int,
    primary_category_id: int,
    extra_category_ids: list[int] | None,
    merge_existing: bool,
) -> None:
    if merge_existing:
        res = await db.execute(
            select(ProductCategory.category_id).where(ProductCategory.product_id == product_id)
        )
        extras = {int(r) for r in res.scalars().all()}
        extras.discard(primary_category_id)
        want: set[int] = {primary_category_id, *extras}
    else:
        want = {primary_category_id, *{int(x) for x in (extra_category_ids or [])}}
    await _ensure_category_ids_exist(db, want)
    await db.execute(delete(ProductCategory).where(ProductCategory.product_id == product_id))
    for cid in sorted(want):
        db.add(ProductCategory(product_id=product_id, category_id=cid))
    await db.flush()


async def _product_tax_ids_map(db: AsyncSession, product_ids: list[int]) -> dict[int, list[int]]:
    if not product_ids:
        return {}
    base = {int(pid): [] for pid in product_ids}
    result = await db.execute(
        select(ProductTaxDefinition.product_id, ProductTaxDefinition.tax_definition_id).where(
            ProductTaxDefinition.product_id.in_(product_ids)
        )
    )
    for pid, tid in result.all():
        base.setdefault(int(pid), []).append(int(tid))
    return {k: sorted(set(v)) for k, v in base.items()}


async def _tax_effective_rates_and_ids(
    db: AsyncSession, products: list[Product]
) -> dict[int, tuple[Decimal, list[int]]]:
    """Return per-product (effective output_vat_rate for POS/API, sorted tax definition ids)."""
    if not products:
        return {}
    ids = [p.id for p in products]
    tax_ids_map = await _product_tax_ids_map(db, ids)
    sum_res = await db.execute(
        select(ProductTaxDefinition.product_id, func.sum(TaxDefinition.rate))
        .join(TaxDefinition, TaxDefinition.id == ProductTaxDefinition.tax_definition_id)
        .where(ProductTaxDefinition.product_id.in_(ids), TaxDefinition.is_active.is_(True))
        .group_by(ProductTaxDefinition.product_id)
    )
    sums: dict[int, Decimal] = {}
    for row in sum_res.all():
        sums[int(row[0])] = to_decimal(row[1])
    out: dict[int, tuple[Decimal, list[int]]] = {}
    for p in products:
        tids = tax_ids_map.get(p.id, [])
        has_links = len(tids) > 0
        s = sums.get(p.id, Decimal("0"))
        if has_links and s > 0:
            eff = min(Decimal("1"), s)
        else:
            raw = p.output_vat_rate if p.output_vat_rate is not None else Decimal("0")
            eff = to_decimal(raw)
        if eff < 0:
            eff = Decimal("0")
        if eff > Decimal("1"):
            eff = Decimal("1")
        out[p.id] = (eff, tids)
    return out


async def map_effective_output_tax_rates(
    db: AsyncSession,
    *,
    products_by_id: dict[int, Product],
) -> dict[int, Decimal]:
    """Batch effective tax-exclusive rate for cart / invoice math (parallel taxes summed)."""
    if not products_by_id:
        return {}
    rows = await _tax_effective_rates_and_ids(db, list(products_by_id.values()))
    return {pid: rows[pid][0] for pid in products_by_id}


async def _ensure_tax_definition_ids_exist(db: AsyncSession, ids: set[int]) -> None:
    if not ids:
        return
    result = await db.execute(select(TaxDefinition.id).where(TaxDefinition.id.in_(list(ids))))
    found = {int(r) for r in result.scalars().all()}
    missing = sorted(ids - found)
    if missing:
        raise ValidationError("Unknown tax_definition_id", details={"tax_definition_ids": missing})


async def _validate_tax_link_bundle(db: AsyncSession, tax_ids: list[int]) -> None:
    if not tax_ids:
        return
    unique = sorted(set(tax_ids))
    if len(unique) != len(tax_ids):
        raise ValidationError(
            "Duplicate tax_definition_id", details={"tax_definition_ids": tax_ids}
        )
    await _ensure_tax_definition_ids_exist(db, set(unique))
    res = await db.execute(
        select(TaxDefinition.id, TaxDefinition.rate, TaxDefinition.is_active).where(
            TaxDefinition.id.in_(unique)
        )
    )
    rows = {int(r[0]): (to_decimal(r[1]), bool(r[2])) for r in res.all()}
    for tid in unique:
        rate_active = rows.get(tid)
        if rate_active is None:
            continue
        _rate, active = rate_active
        if not active:
            raise ValidationError(
                "Inactive tax_definition cannot be assigned",
                details={"tax_definition_id": tid},
            )
    total = sum((rows[tid][0] for tid in unique), Decimal("0"))
    if total >= Decimal("1"):
        raise ValidationError(
            "Combined tax rate must be strictly less than 1",
            details={"sum_rate": str(total)},
        )


async def sync_product_tax_definition_links(
    db: AsyncSession, *, product_id: int, tax_definition_ids: list[int] | None
) -> None:
    if tax_definition_ids is None:
        return
    want = sorted(set(tax_definition_ids))
    await _validate_tax_link_bundle(db, want)
    await db.execute(
        delete(ProductTaxDefinition).where(ProductTaxDefinition.product_id == product_id)
    )
    for tid in want:
        db.add(ProductTaxDefinition(product_id=product_id, tax_definition_id=tid))
    await db.flush()


async def list_tax_definitions(
    db: AsyncSession, *, include_inactive: bool = True
) -> list[TaxDefinition]:
    q = select(TaxDefinition).order_by(TaxDefinition.name.asc())
    if not include_inactive:
        q = q.where(TaxDefinition.is_active.is_(True))
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_tax_definition_row(db: AsyncSession, tax_id: int) -> TaxDefinition:
    result = await db.execute(select(TaxDefinition).where(TaxDefinition.id == tax_id))
    row = result.scalar_one_or_none()
    if not row:
        raise NotFoundError("Tax definition not found", details={"tax_definition_id": tax_id})
    return row


async def create_tax_definition(db: AsyncSession, *, data: dict[str, Any]) -> TaxDefinition:
    row = TaxDefinition(**data)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Tax definition code conflicts with existing row") from e
    await db.refresh(row)
    return row


async def update_tax_definition(
    db: AsyncSession, *, tax_id: int, data: dict[str, Any]
) -> TaxDefinition:
    row = await get_tax_definition_row(db, tax_id)
    for k, v in data.items():
        setattr(row, k, v)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Tax definition update conflicts with existing data") from e
    await db.refresh(row)
    return row


async def archive_tax_definition(db: AsyncSession, *, tax_id: int) -> TaxDefinition:
    row = await get_tax_definition_row(db, tax_id)
    row.is_active = False
    await db.commit()
    await db.refresh(row)
    return row


async def list_units_of_measure(db: AsyncSession) -> list[UnitOfMeasureRead]:
    res = await db.execute(select(UnitOfMeasure).order_by(UnitOfMeasure.id.asc()))
    return [UnitOfMeasureRead.model_validate(r) for r in res.scalars().all()]


async def get_default_uom_id(db: AsyncSession) -> int:
    res = await db.execute(select(UnitOfMeasure.id).where(UnitOfMeasure.code == "PIECE").limit(1))
    uid = res.scalar_one_or_none()
    if uid is None:
        raise ValidationError("Default unit of measure (PIECE) is not configured")
    return int(uid)


async def resolve_product_uom_id(db: AsyncSession, uom_id: int | None) -> int:
    if uom_id is None:
        return await get_default_uom_id(db)
    res = await db.execute(select(UnitOfMeasure.id).where(UnitOfMeasure.id == int(uom_id)).limit(1))
    if res.scalar_one_or_none() is None:
        raise ValidationError("Unit of measure not found", details={"uom_id": uom_id})
    return int(uom_id)


async def _uom_map_for_ids(db: AsyncSession, uom_ids: Iterable[int]) -> dict[int, UnitOfMeasure]:
    ids = list({int(x) for x in uom_ids})
    if not ids:
        return {}
    res = await db.execute(select(UnitOfMeasure).where(UnitOfMeasure.id.in_(ids)))
    return {int(r.id): r for r in res.scalars().all()}


async def _get_uom_row(db: AsyncSession, uom_id: int) -> UnitOfMeasure:
    res = await db.execute(select(UnitOfMeasure).where(UnitOfMeasure.id == int(uom_id)).limit(1))
    row = res.scalar_one_or_none()
    if row is None:
        raise ValidationError("Unit of measure not found", details={"uom_id": uom_id})
    return row


def _validate_uom_category_compatible(*, base: UnitOfMeasure, alt: UnitOfMeasure) -> None:
    if base.measurement_category != alt.measurement_category:
        raise ValidationError(
            "Alternative unit must share the same measurement category as the base unit",
            details={
                "base_uom_id": base.id,
                "base_category": base.measurement_category,
                "alt_uom_id": alt.id,
                "alt_category": alt.measurement_category,
            },
        )


async def _alternative_uoms_for_products(
    db: AsyncSession, product_ids: list[int]
) -> dict[int, list[ProductAlternativeUomRead]]:
    if not product_ids:
        return {}
    res = await db.execute(
        select(ProductUnitConversion, UnitOfMeasure)
        .join(UnitOfMeasure, ProductUnitConversion.uom_id == UnitOfMeasure.id)
        .where(ProductUnitConversion.product_id.in_(product_ids))
        .order_by(ProductUnitConversion.id.asc())
    )
    out: dict[int, list[ProductAlternativeUomRead]] = {pid: [] for pid in product_ids}
    for conv, uom in res.all():
        out[int(conv.product_id)].append(
            ProductAlternativeUomRead(
                uom_id=int(uom.id),
                uom_code=uom.code,
                uom_name=uom.name,
                uom_symbol=uom.symbol,
                measurement_category=uom.measurement_category,
                factor_to_base=int(conv.factor_to_base),
            )
        )
    return out


async def sync_product_unit_conversions(
    db: AsyncSession,
    *,
    product_id: int,
    base_uom_id: int,
    alternatives: list[dict[str, Any]] | None,
) -> None:
    """Replace all alternative UoM rows for a product."""
    if alternatives is None:
        return
    base_uom = await _get_uom_row(db, base_uom_id)
    seen_uom_ids: set[int] = set()
    rows: list[ProductUnitConversion] = []
    for raw in alternatives:
        alt_uom_id = int(raw["uom_id"])
        if alt_uom_id in seen_uom_ids:
            raise ValidationError(
                "Duplicate alternative unit of measure",
                details={"uom_id": alt_uom_id},
            )
        seen_uom_ids.add(alt_uom_id)
        if alt_uom_id == int(base_uom_id):
            raise ValidationError(
                "Base unit cannot be listed as an alternative unit",
                details={"uom_id": alt_uom_id},
            )
        try:
            factor_decimal = Decimal(str(raw["factor_to_base"]))
        except Exception as e:
            raise ValidationError(
                "Conversion factor must be a whole number",
                details={"uom_id": alt_uom_id, "factor_to_base": raw.get("factor_to_base")},
            ) from e
        if factor_decimal <= 0 or factor_decimal != factor_decimal.to_integral_value():
            raise ValidationError(
                "Conversion factor must be a positive whole number",
                details={"uom_id": alt_uom_id, "factor_to_base": str(factor_decimal)},
            )
        factor = Decimal(int(factor_decimal))
        alt_uom = await _get_uom_row(db, alt_uom_id)
        _validate_uom_category_compatible(base=base_uom, alt=alt_uom)
        rows.append(
            ProductUnitConversion(
                product_id=int(product_id),
                uom_id=alt_uom_id,
                factor_to_base=factor,
            )
        )

    await db.execute(
        delete(ProductUnitConversion).where(ProductUnitConversion.product_id == int(product_id))
    )
    for row in rows:
        db.add(row)
    await db.flush()


def _product_read_extras(
    *,
    product: Product,
    category_ids: list[int],
    tax_definition_ids: list[int],
    output_vat_rate: Decimal,
    variant_count: int,
    uom: UnitOfMeasure | None,
    alternative_uoms: list[ProductAlternativeUomRead] | None = None,
) -> dict[str, Any]:
    u = uom
    return {
        "category_ids": category_ids,
        "tax_definition_ids": tax_definition_ids,
        "output_vat_rate": output_vat_rate,
        "variant_count": variant_count,
        "has_variants": variant_count > 1,
        "uom_id": product.uom_id,
        "uom_name": u.name if u else "Piece",
        "uom_symbol": u.symbol if u else "pcs",
        "alternative_uoms": alternative_uoms or [],
    }


async def product_to_read(db: AsyncSession, product: Product) -> ProductRead:
    tag_map = await _product_tag_map(db, [product.id])
    merged = {product.category_id, *tag_map.get(product.id, [])}
    tax_fields = await _tax_effective_rates_and_ids(db, [product])
    eff, tids = tax_fields[product.id]
    variant_counts = await _variant_counts_for_products(db, [product.id])
    vcount = variant_counts.get(product.id, 0)
    uom_map = await _uom_map_for_ids(db, [product.uom_id])
    uom = uom_map.get(product.uom_id)
    alt_map = await _alternative_uoms_for_products(db, [product.id])
    return ProductRead.model_validate(product).model_copy(
        update=_product_read_extras(
            product=product,
            category_ids=sorted(merged),
            tax_definition_ids=tids,
            output_vat_rate=eff,
            variant_count=vcount,
            uom=uom,
            alternative_uoms=alt_map.get(product.id, []),
        )
    )


async def _variant_counts_for_products(db: AsyncSession, product_ids: list[int]) -> dict[int, int]:
    if not product_ids:
        return {}
    res = await db.execute(
        select(ProductVariant.product_id, func.count())
        .where(
            ProductVariant.product_id.in_(product_ids),
            ProductVariant.active.is_(True),
        )
        .group_by(ProductVariant.product_id)
    )
    return {int(pid): int(n) for pid, n in res.all()}


async def products_to_reads(db: AsyncSession, products: list[Product]) -> list[ProductRead]:
    if not products:
        return []
    ids = [p.id for p in products]
    tag_map, tax_fields, variant_counts, uom_map, alt_map = await asyncio.gather(
        _product_tag_map(db, ids),
        _tax_effective_rates_and_ids(db, products),
        _variant_counts_for_products(db, ids),
        _uom_map_for_ids(db, [p.uom_id for p in products]),
        _alternative_uoms_for_products(db, ids),
    )
    out: list[ProductRead] = []
    for p in products:
        merged = {p.category_id, *tag_map.get(p.id, [])}
        eff, tids = tax_fields[p.id]
        vcount = variant_counts.get(p.id, 0)
        out.append(
            ProductRead.model_validate(p).model_copy(
                update=_product_read_extras(
                    product=p,
                    category_ids=sorted(merged),
                    tax_definition_ids=tids,
                    output_vat_rate=eff,
                    variant_count=vcount,
                    uom=uom_map.get(p.uom_id),
                    alternative_uoms=alt_map.get(p.id, []),
                )
            )
        )
    return out


async def get_product(db: AsyncSession, product_id: int) -> Product:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Product not found", details={"product_id": product_id})
    return product


async def _ensure_default_product_variant(db: AsyncSession, product: Product) -> None:
    """Create one stock-keeping variant for a new product (mirrors backfill_product_variants)."""
    existing = await db.execute(
        select(ProductVariant.id).where(ProductVariant.product_id == product.id).limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        return
    now = datetime.now(UTC)
    from app.utils.variant_combination_key import DEFAULT_VARIANT_COMBINATION_KEY

    pv = ProductVariant(
        product_id=product.id,
        sku=product.sku,
        barcode=None,
        combination_key=DEFAULT_VARIANT_COMBINATION_KEY,
        attribute_values={"_default": True},
        active=product.status == "active",
        created_at=now,
        updated_at=now,
    )
    db.add(pv)
    await db.flush()
    assign_variant_barcode_if_missing(pv)


async def _apply_product_list_filters(
    db: AsyncSession,
    stmt: Select[tuple[Product]],
    *,
    q: str | None = None,
    category_id: int | None = None,
    category_include_descendants: bool = False,
    status: str | None = None,
    branch_id: int | None = None,
    in_stock_only: bool = False,
) -> Select[tuple[Product]]:
    qs = (q or "").strip()
    if qs:
        like = f"%{qs}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    if category_id is not None:
        scope_ids = (
            await _category_descendant_ids(db, category_id)
            if category_include_descendants
            else {category_id}
        )
        id_list = list(scope_ids)
        tag_match = exists().where(
            and_(ProductCategory.product_id == Product.id, ProductCategory.category_id.in_(id_list))
        )
        stmt = stmt.where(or_(Product.category_id.in_(id_list), tag_match))
    if status is not None:
        stmt = stmt.where(Product.status == status)

    if in_stock_only:
        if branch_id is None:
            raise ValidationError(
                "branch_id is required when in_stock_only is true",
                details={},
            )
        stmt = stmt.where(
            exists().where(
                and_(
                    StockLevel.product_id == Product.id,
                    StockLevel.branch_id == branch_id,
                    StockLevel.on_hand > 0,
                )
            )
        )

    return stmt


async def count_products(
    db: AsyncSession,
    *,
    q: str | None = None,
    category_id: int | None = None,
    category_include_descendants: bool = False,
    status: str | None = None,
    branch_id: int | None = None,
    in_stock_only: bool = False,
) -> int:
    base = select(Product)
    filtered = await _apply_product_list_filters(
        db,
        base,
        q=q,
        category_id=category_id,
        category_include_descendants=category_include_descendants,
        status=status,
        branch_id=branch_id,
        in_stock_only=in_stock_only,
    )
    count_stmt = select(func.count()).select_from(filtered.subquery())
    result = await db.execute(count_stmt)
    return int(result.scalar_one())


def _product_list_load_options() -> tuple:
    """Eager-load catalog relations used when building list reads (avoids per-row lazy IO)."""
    return (
        selectinload(Product.category_links),
        selectinload(Product.tax_definition_links),
        selectinload(Product.unit_of_measure),
        selectinload(Product.unit_conversions),
    )


async def list_products(
    db: AsyncSession,
    *,
    q: str | None = None,
    category_id: int | None = None,
    category_include_descendants: bool = False,
    status: str | None = None,
    branch_id: int | None = None,
    in_stock_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Product]:
    """List products with category, stock, and text filters."""
    stmt = select(Product).options(*_product_list_load_options())
    stmt = await _apply_product_list_filters(
        db,
        stmt,
        q=q,
        category_id=category_id,
        category_include_descendants=category_include_descendants,
        status=status,
        branch_id=branch_id,
        in_stock_only=in_stock_only,
    )

    qs = (q or "").strip()
    if qs:
        prefix = f"{qs}%"
        ql = func.lower(qs)
        rank = case(
            (func.lower(Product.sku) == ql, 0),
            (Product.sku.ilike(prefix), 1),
            (Product.name.ilike(prefix), 2),
            else_=3,
        )
        stmt = stmt.order_by(rank.asc(), Product.name.asc(), Product.id.desc())
    else:
        stmt = stmt.order_by(Product.id.desc())

    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def search_product_variants_for_purchasing(
    db: AsyncSession,
    *,
    q: str | None,
    limit: int = 50,
    offset: int = 0,
    attribute_value_id: int | None = None,
    product_id: int | None = None,
    priced_only: bool = False,
) -> list[ProductVariantPurchasingSearchItem]:
    """Search active variants joined to active products (PO / receiving pickers)."""
    qs = (q or "").strip()
    from app.models.product_variant_attribute import ProductVariantAttribute

    stmt = (
        select(ProductVariant, Product)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(Product.status == "active", ProductVariant.active.is_(True))
    )
    if product_id is not None:
        stmt = stmt.where(ProductVariant.product_id == int(product_id))
    if attribute_value_id is not None:
        stmt = stmt.where(
            exists().where(
                ProductVariantAttribute.variant_id == ProductVariant.id,
                ProductVariantAttribute.attribute_value_id == attribute_value_id,
            )
        )
    if qs:
        like = f"%{qs}%"
        prefix = f"{qs}%"
        ql = func.lower(qs)
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                ProductVariant.reference_code.ilike(like),
            )
        )
        rank = case(
            (func.lower(ProductVariant.reference_code) == ql, 0),
            (ProductVariant.reference_code.ilike(prefix), 1),
            (Product.name.ilike(prefix), 2),
            else_=3,
        )
        stmt = stmt.order_by(rank.asc(), Product.name.asc(), ProductVariant.id.asc())
    else:
        stmt = stmt.order_by(Product.name.asc(), ProductVariant.id.asc())

    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.all()
    items: list[ProductVariantPurchasingSearchItem] = []
    for pv, pr in rows:
        attr_vals = (
            dict(pv.attribute_values)
            if isinstance(getattr(pv, "attribute_values", None), dict)
            else None
        )
        items.append(
            ProductVariantPurchasingSearchItem(
                variant_id=int(pv.id),
                product_id=int(pr.id),
                category_id=int(pr.category_id),
                display_name=pr.name,
                sku=pv.sku,
                reference_code=pv.reference_code,
                barcode=pv.barcode,
                variant_label=variant_value_labels_summary(attr_vals),
                variant_attributes=variant_attributes_summary(attr_vals),
                attribute_values=attr_vals,
            )
        )
    if not priced_only:
        return items

    from app.services.pricing_service import get_active_product_price

    priced: list[ProductVariantPurchasingSearchItem] = []
    for item in items:
        price = await get_active_product_price(
            db, product_id=item.product_id, variant_id=item.variant_id
        )
        if price is not None and price.amount > Decimal("0.00"):
            priced.append(item)
    return priced


async def create_product(db: AsyncSession, *, data: dict[str, Any]) -> Product:
    data = dict(data)
    sell_price_value = data.pop("sell_price", None)
    sell_price_currency_id = data.pop("sell_price_currency_id", None)
    extra_tags = data.pop("category_ids", None) or []
    tax_definition_ids = data.pop("tax_definition_ids", None)
    data.pop("attributes", None)
    data.pop("barcode", None)
    raw_uom = data.pop("uom_id", None)
    alternative_uoms = data.pop("alternative_uoms", None)
    data["uom_id"] = await resolve_product_uom_id(db, raw_uom)
    category_id = data["category_id"]
    await get_category(db, category_id)
    await _ensure_category_ids_exist(db, {category_id, *{int(x) for x in extra_tags}})
    sell_price = _normalize_sell_price(sell_price_value) if sell_price_value is not None else None
    raw_sku = data.get("sku")
    auto_sku = raw_sku is None or (isinstance(raw_sku, str) and raw_sku.strip() == "")
    if auto_sku:
        data["sku"] = f"__AUTO{secrets.token_hex(16)}__"
    elif isinstance(raw_sku, str):
        try:
            data["sku"] = validate_sku_reference(raw_sku.strip())
        except ValueError as exc:
            raise ValidationError(str(exc), details={"field": "sku"}) from exc
    product = Product(**data)
    db.add(product)
    try:
        await db.flush()
        if auto_sku:
            category = await get_category(db, category_id)
            prefix = category_slug_to_prefix(category.slug)
            product.sku = format_product_sku(prefix, product.id)
            await db.flush()
        product.barcode = None
        await sync_product_category_links(
            db,
            product_id=product.id,
            primary_category_id=product.category_id,
            extra_category_ids=list(extra_tags),
            merge_existing=False,
        )
        await sync_product_tax_definition_links(
            db,
            product_id=product.id,
            tax_definition_ids=list(tax_definition_ids or []),
        )
        if alternative_uoms is not None:
            alt_payload = [
                {"uom_id": int(a["uom_id"]), "factor_to_base": a["factor_to_base"]}
                for a in alternative_uoms
            ]
            await sync_product_unit_conversions(
                db,
                product_id=product.id,
                base_uom_id=int(product.uom_id),
                alternatives=alt_payload,
            )
        if sell_price is not None:
            await set_product_sell_price(
                db,
                product_id=product.id,
                amount=sell_price,
                currency_id=sell_price_currency_id,
            )
        await _ensure_default_product_variant(db, product)
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError(
            "Product conflicts with existing data", details={"error": str(e.orig)}
        ) from e
    await db.refresh(product)
    return product


async def update_product(db: AsyncSession, *, product_id: int, data: dict[str, Any]) -> Product:
    data = dict(data)
    product = await get_product(db, product_id)
    sell_price_value = data.pop("sell_price", _UNSET)
    has_sell_price_currency = "sell_price_currency_id" in data
    sell_price_currency_id = data.pop("sell_price_currency_id", None)
    extra_tags = data.pop("category_ids", _UNSET)
    tax_definition_ids = data.pop("tax_definition_ids", _UNSET)
    alternative_uoms = data.pop("alternative_uoms", _UNSET)
    data.pop("attributes", None)
    data.pop("barcode", None)
    if "uom_id" in data:
        raw_uom = data.pop("uom_id")
        if raw_uom is not None:
            data["uom_id"] = await resolve_product_uom_id(db, raw_uom)
    category_id = data.get("category_id", product.category_id)
    await get_category(db, category_id)
    if extra_tags is not _UNSET:
        await _ensure_category_ids_exist(
            db, {int(category_id), *{int(x) for x in (extra_tags or [])}}
        )

    sell_price: Decimal | None = None
    if sell_price_value is not _UNSET or has_sell_price_currency:
        sell_price = (
            None
            if sell_price_value is _UNSET or sell_price_value is None
            else _normalize_sell_price(sell_price_value)
        )

    if "sku" in data and data["sku"] is not None:
        try:
            data["sku"] = validate_sku_reference(str(data["sku"]))
        except ValueError as exc:
            raise ValidationError(str(exc), details={"field": "sku"}) from exc

    for k, v in data.items():
        setattr(product, k, v)
    try:
        await db.flush()
        product.barcode = None
        if sell_price is not None:
            await set_product_sell_price(
                db,
                product_id=product.id,
                amount=sell_price,
                currency_id=sell_price_currency_id,
            )
        if extra_tags is _UNSET:
            await sync_product_category_links(
                db,
                product_id=product.id,
                primary_category_id=product.category_id,
                extra_category_ids=None,
                merge_existing=True,
            )
        else:
            await sync_product_category_links(
                db,
                product_id=product.id,
                primary_category_id=product.category_id,
                extra_category_ids=list(extra_tags or []),
                merge_existing=False,
            )
        if tax_definition_ids is not _UNSET:
            await sync_product_tax_definition_links(
                db,
                product_id=product.id,
                tax_definition_ids=list(tax_definition_ids or []),
            )
        if alternative_uoms is not _UNSET:
            alt_payload = [
                {"uom_id": int(a["uom_id"]), "factor_to_base": a["factor_to_base"]}
                for a in (alternative_uoms or [])
            ]
            await sync_product_unit_conversions(
                db,
                product_id=product.id,
                base_uom_id=int(product.uom_id),
                alternatives=alt_payload,
            )
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Product update conflicts with existing data") from e
    await db.refresh(product)
    return product


async def archive_product(db: AsyncSession, *, product_id: int) -> Product:
    return await update_product(db, product_id=product_id, data={"status": "archived"})


async def unarchive_product(db: AsyncSession, *, product_id: int) -> Product:
    return await update_product(db, product_id=product_id, data={"status": "active"})


async def resolve_default_variant_id(db: AsyncSession, *, product_id: int) -> int:
    """Return the preferred stock-keeping variant for a product (active, lowest id).

    Caches per DB session (``session.info``) to avoid repeated lookups in one request.
    """
    cache: dict[int, int] = db.info.setdefault("default_variant_id_cache", {})
    if product_id in cache:
        return cache[product_id]

    res = await db.execute(
        select(ProductVariant.id)
        .where(ProductVariant.product_id == product_id, ProductVariant.active.is_(True))
        .order_by(ProductVariant.id.asc())
        .limit(1)
    )
    vid = res.scalar_one_or_none()
    if vid is not None:
        out = int(vid)
        cache[product_id] = out
        return out
    res2 = await db.execute(
        select(ProductVariant.id)
        .where(ProductVariant.product_id == product_id)
        .order_by(ProductVariant.id.asc())
        .limit(1)
    )
    vid2 = res2.scalar_one_or_none()
    if vid2 is not None:
        out = int(vid2)
        cache[product_id] = out
        return out
    raise ValidationError(
        "No product variant for product",
        details={"product_id": product_id},
    )


async def generate_product_barcode(db: AsyncSession, *, product_id: int) -> Product:
    """Deprecated product-level barcode; assigns missing barcodes on variants instead."""
    product = await get_product(db, product_id)
    from app.services.variant_attribute_service import generate_missing_variant_barcodes

    await generate_missing_variant_barcodes(db, product_id=product_id)
    product.barcode = None
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Generated barcode conflicts with existing barcode") from e
    await db.refresh(product)
    return product


def save_category_image_bytes(file_body: bytes) -> str:
    """Validate image bytes, persist to disk, return URL path under static mount."""
    if len(file_body) > settings.CATALOG_CATEGORY_IMAGE_MAX_BYTES:
        raise ValueError("category_image_too_large")
    ext = detect_raster_image_extension(file_body[:64])
    if ext is None:
        raise ValueError("category_image_invalid")
    root = Path(settings.CATALOG_CATEGORY_IMAGE_UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    (root / filename).write_bytes(file_body)
    return f"/api/v1/static/catalog-category-images/{filename}"


def save_product_image_bytes(file_body: bytes) -> str:
    """Validate image bytes, persist to disk, return URL path under product static mount."""
    if len(file_body) > settings.CATALOG_PRODUCT_IMAGE_MAX_BYTES:
        raise ValueError("product_image_too_large")
    ext = detect_raster_image_extension(file_body[:64])
    if ext is None:
        raise ValueError("product_image_invalid")
    root = Path(settings.CATALOG_PRODUCT_IMAGE_UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    (root / filename).write_bytes(file_body)
    return f"/api/v1/static/catalog-product-images/{filename}"
