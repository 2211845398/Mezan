"""Catalog service: categories, dynamic attribute definitions, products, barcodes."""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Iterable
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import Select, and_, delete, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.category import Category
from app.models.category_attribute_def import CategoryAttributeDef
from app.models.product import Product
from app.models.product_category import ProductCategory
from app.schemas.catalog import CategoryTreeNode, ProductRead
from app.services.pricing_service import set_product_sell_price
from app.utils.image_format import detect_raster_image_extension
from app.utils.money import to_decimal

PRICE_COMPAT_KEY = "price"
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
    result = await db.execute(select(Product.category_id, func.count()).group_by(Product.category_id))
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


async def list_category_attribute_defs(
    db: AsyncSession, *, category_id: int
) -> list[CategoryAttributeDef]:
    await get_category(db, category_id)
    result = await db.execute(
        select(CategoryAttributeDef)
        .where(CategoryAttributeDef.category_id == category_id)
        .order_by(CategoryAttributeDef.sort_order.asc(), CategoryAttributeDef.key.asc())
    )
    return list(result.scalars().all())


async def _category_ancestor_ids_chain(db: AsyncSession, category_id: int) -> list[int]:
    """Immediate parent first, then further ancestors toward the root."""
    out: list[int] = []
    visited: set[int] = set()
    res = await db.execute(select(Category).where(Category.id == category_id))
    cat = res.scalar_one_or_none()
    if not cat:
        return out
    pid: int | None = cat.parent_id
    while pid is not None and pid not in visited:
        visited.add(pid)
        out.append(pid)
        res = await db.execute(select(Category).where(Category.id == pid))
        parent = res.scalar_one_or_none()
        pid = parent.parent_id if parent else None
    return out


async def _has_attr_key(db: AsyncSession, category_id: int, key: str) -> bool:
    r = await db.execute(
        select(CategoryAttributeDef.id).where(
            and_(CategoryAttributeDef.category_id == category_id, CategoryAttributeDef.key == key)
        )
    )
    return r.scalar_one_or_none() is not None


async def list_category_attribute_defs_for_ui(
    db: AsyncSession, *, category_id: int, include_inherited: bool
) -> list[tuple[CategoryAttributeDef, bool, str | None]]:
    """Return (row, is_inherited, source_category_name) for admin UI.

    When ``include_inherited`` is False, only rows stored on ``category_id`` are returned
    (each with correct ``is_inherited`` for propagated copies).
    When True, ancestor definitions that are not overridden on this category are appended
    (virtual inherited rows).
    """
    await get_category(db, category_id)
    local_rows = await list_category_attribute_defs(db, category_id=category_id)
    name_ids: set[int] = set()
    for r in local_rows:
        name_ids.add(r.category_id)
        if r.inherited_from_category_id is not None:
            name_ids.add(r.inherited_from_category_id)

    items: list[tuple[CategoryAttributeDef, bool, str | None]] = []

    def is_row_inherited(r: CategoryAttributeDef) -> bool:
        return r.inherited_from_category_id is not None

    for r in local_rows:
        src_id = r.inherited_from_category_id if r.inherited_from_category_id is not None else r.category_id
        name_ids.add(src_id)
        items.append((r, is_row_inherited(r), None))

    if include_inherited:
        local_keys = {r.key for r in local_rows}
        ancestor_ids = await _category_ancestor_ids_chain(db, category_id)
        name_ids.update(ancestor_ids)
        for aid in ancestor_ids:
            ancestor_defs = await _load_attr_defs(db, aid)
            for d in sorted(ancestor_defs, key=lambda x: (x.sort_order, x.key)):
                if d.key not in local_keys:
                    local_keys.add(d.key)
                    name_ids.add(d.category_id)
                    items.append((d, True, None))

    if not items:
        return []

    res = await db.execute(select(Category.id, Category.name).where(Category.id.in_(sorted(name_ids))))
    name_map = {int(i): str(n) for i, n in res.all()}

    out: list[tuple[CategoryAttributeDef, bool, str | None]] = []
    for r, inh, _ in items:
        src_id = r.inherited_from_category_id if r.inherited_from_category_id is not None else r.category_id
        src_name = name_map.get(src_id)
        out.append((r, inh, src_name))
    return out


async def create_category_attribute_def(
    db: AsyncSession, *, category_id: int, data: dict[str, Any]
) -> CategoryAttributeDef:
    await get_category(db, category_id)
    payload = dict(data)
    payload.pop("inherited_from_category_id", None)
    rec = CategoryAttributeDef(
        category_id=category_id,
        inherited_from_category_id=None,
        **payload,
    )
    db.add(rec)
    try:
        await db.flush()
        descendants = await _category_descendant_ids(db, category_id)
        for desc_id in descendants:
            if desc_id == category_id:
                continue
            if await _has_attr_key(db, desc_id, rec.key):
                continue
            child = CategoryAttributeDef(
                category_id=desc_id,
                inherited_from_category_id=category_id,
                key=rec.key,
                label=rec.label,
                type=rec.type,
                required=False,
                options=rec.options,
                validation=rec.validation,
                sort_order=rec.sort_order,
            )
            db.add(child)
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError(
            "Attribute definition already exists", details={"key": data.get("key")}
        ) from e
    await db.refresh(rec)
    return rec


async def update_category_attribute_def(
    db: AsyncSession, *, category_id: int, attr_id: int, data: dict[str, Any]
) -> CategoryAttributeDef:
    await get_category(db, category_id)
    result = await db.execute(
        select(CategoryAttributeDef).where(
            and_(
                CategoryAttributeDef.id == attr_id,
                CategoryAttributeDef.category_id == category_id,
            )
        )
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise NotFoundError("Attribute definition not found", details={"attr_id": attr_id})
    data = dict(data)
    data.pop("inherited_from_category_id", None)
    for k, v in data.items():
        setattr(rec, k, v)
    try:
        await db.flush()
        if rec.inherited_from_category_id is None:
            q = await db.execute(
                select(CategoryAttributeDef).where(
                    and_(
                        CategoryAttributeDef.inherited_from_category_id == category_id,
                        CategoryAttributeDef.key == rec.key,
                    )
                )
            )
            for child_rec in q.scalars().all():
                child_rec.label = rec.label
                child_rec.type = rec.type
                child_rec.options = rec.options
                child_rec.validation = rec.validation
                child_rec.sort_order = rec.sort_order
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Attribute update conflicts with existing data") from e
    await db.refresh(rec)
    return rec


async def delete_category_attribute_def(
    db: AsyncSession, *, category_id: int, attr_id: int
) -> None:
    await get_category(db, category_id)
    result = await db.execute(
        select(CategoryAttributeDef).where(
            and_(
                CategoryAttributeDef.id == attr_id,
                CategoryAttributeDef.category_id == category_id,
            )
        )
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise NotFoundError("Attribute definition not found", details={"attr_id": attr_id})
    try:
        if rec.inherited_from_category_id is None:
            await db.execute(
                delete(CategoryAttributeDef).where(
                    and_(
                        CategoryAttributeDef.inherited_from_category_id == category_id,
                        CategoryAttributeDef.key == rec.key,
                    )
                )
            )
        await db.delete(rec)
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Cannot delete attribute definition") from e


async def _load_attr_defs(db: AsyncSession, category_id: int) -> list[CategoryAttributeDef]:
    result = await db.execute(
        select(CategoryAttributeDef).where(CategoryAttributeDef.category_id == category_id)
    )
    return list(result.scalars().all())


async def _load_merged_attr_defs_for_category(
    db: AsyncSession, category_id: int
) -> list[CategoryAttributeDef]:
    """Definitions for product validation: local rows override ancestor keys (nearest ancestor fills gaps)."""
    local_rows = await _load_attr_defs(db, category_id)
    by_key: dict[str, CategoryAttributeDef] = {}
    for d in sorted(local_rows, key=lambda x: (x.sort_order, x.key)):
        by_key[d.key] = d
    for aid in await _category_ancestor_ids_chain(db, category_id):
        for d in sorted(await _load_attr_defs(db, aid), key=lambda x: (x.sort_order, x.key)):
            if d.key not in by_key:
                by_key[d.key] = d
    return sorted(by_key.values(), key=lambda x: (x.sort_order, x.key))


def _validate_product_attributes(
    *, attrs: dict[str, Any], defs: list[CategoryAttributeDef]
) -> dict[str, Any]:
    """Validate product attributes against category definitions (Epic 18.7: enum/select validation)."""
    allowed = {d.key: d for d in defs}
    unknown_keys = sorted([k for k in attrs.keys() if k not in allowed and k != PRICE_COMPAT_KEY])
    if unknown_keys:
        raise ValidationError(
            "Unknown attributes",
            details={"unknown_keys": unknown_keys},
        )
    missing_required = sorted([d.key for d in defs if d.required and d.key not in attrs])
    if missing_required:
        raise ValidationError(
            "Missing required attributes",
            details={"missing_keys": missing_required},
        )

    # Light type validation (non-exhaustive, extensible via `validation` JSON).
    for key, value in attrs.items():
        if key == PRICE_COMPAT_KEY and key not in allowed:
            if value is not None and not isinstance(value, (int, float)):
                raise ValidationError(
                    "Invalid attribute type", details={"key": key, "expected": "float"}
                )
            continue
        def_spec = allowed[key]
        spec = def_spec.type.lower()
        if value is None:
            continue

        # Epic 18.7: Enum/select validation
        if spec in {"select", "enum", "dropdown"}:
            options = (def_spec.options or {}).get("values", [])
            if options and value not in options:
                raise ValidationError(
                    "Invalid enum value",
                    details={"key": key, "value": value, "allowed": options},
                )
            continue

        # Epic 18.7: Multi-select validation
        if spec in {"multiselect", "multi_select", "tags"}:
            options = (def_spec.options or {}).get("values", [])
            if isinstance(value, list) and options:
                invalid = [v for v in value if v not in options]
                if invalid:
                    raise ValidationError(
                        "Invalid multi-select values",
                        details={"key": key, "invalid": invalid, "allowed": options},
                    )
            continue

        if spec in {"text", "string"} and not isinstance(value, str):
            raise ValidationError(
                "Invalid attribute type", details={"key": key, "expected": "string"}
            )
        if spec in {"int", "integer"} and not isinstance(value, int):
            raise ValidationError("Invalid attribute type", details={"key": key, "expected": "int"})
        if spec in {"float", "number"} and not isinstance(value, (int, float)):
            raise ValidationError(
                "Invalid attribute type", details={"key": key, "expected": "float"}
            )
        if spec in {"bool", "boolean"} and not isinstance(value, bool):
            raise ValidationError(
                "Invalid attribute type", details={"key": key, "expected": "bool"}
            )
    return attrs


def _normalize_sell_price(raw_value: Any) -> Decimal:
    try:
        sell_price = to_decimal(raw_value)
    except ValueError as exc:
        raise ValidationError("Product has invalid sellable price") from exc
    if sell_price <= Decimal("0.00"):
        raise ValidationError("Product has no sellable price")
    return sell_price


def _derive_sell_price(*, attrs: dict[str, Any], sell_price_value: Any) -> Decimal | None:
    raw_price = sell_price_value if sell_price_value is not None else attrs.get(PRICE_COMPAT_KEY)
    if raw_price is None:
        return None
    return _normalize_sell_price(raw_price)


def _sync_compat_price(attrs: dict[str, Any], *, sell_price: Decimal | None) -> dict[str, Any]:
    synced = dict(attrs)
    if sell_price is not None:
        synced[PRICE_COMPAT_KEY] = sell_price  # Keep as Decimal for JSON serialization
    return synced


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


async def product_to_read(db: AsyncSession, product: Product) -> ProductRead:
    tag_map = await _product_tag_map(db, [product.id])
    merged = {product.category_id, *tag_map.get(product.id, [])}
    return ProductRead.model_validate(product).model_copy(update={"category_ids": sorted(merged)})


async def products_to_reads(db: AsyncSession, products: list[Product]) -> list[ProductRead]:
    if not products:
        return []
    ids = [p.id for p in products]
    tag_map = await _product_tag_map(db, ids)
    out: list[ProductRead] = []
    for p in products:
        merged = {p.category_id, *tag_map.get(p.id, [])}
        out.append(ProductRead.model_validate(p).model_copy(update={"category_ids": sorted(merged)}))
    return out


async def get_product(db: AsyncSession, product_id: int) -> Product:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Product not found", details={"product_id": product_id})
    return product


async def list_products(
    db: AsyncSession,
    *,
    q: str | None = None,
    category_id: int | None = None,
    category_include_descendants: bool = False,
    status: str | None = None,
    # Epic 18.8: Attribute-based filtering
    attributes_filter: dict[str, Any] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Product]:
    """List products with optional attribute-based filtering (Epic 18.8)."""
    stmt: Select[tuple[Product]] = select(Product)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like))
        )
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

    # Epic 18.8: Attribute-based filtering using JSONB containment
    if attributes_filter:
        from sqlalchemy.dialects.postgresql import JSONB
        for attr_key, attr_value in attributes_filter.items():
            # Use JSONB containment for exact match on single attribute
            filter_json = {attr_key: attr_value}
            stmt = stmt.where(Product.attributes.contains(filter_json))

    stmt = stmt.order_by(Product.id.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def filter_products_by_attributes(
    db: AsyncSession,
    *,
    category_id: int | None = None,
    attributes_filter: dict[str, Any],
    limit: int = 50,
    offset: int = 0,
) -> list[Product]:
    """Filter products by category and multiple attributes (Epic 18.8).

    Example: {"color": "red", "size": "L"} finds products with both attributes.
    """
    stmt: Select[tuple[Product]] = select(Product)

    if category_id is not None:
        scope_ids = await _category_descendant_ids(db, category_id)
        id_list = list(scope_ids)
        tag_match = exists().where(
            and_(ProductCategory.product_id == Product.id, ProductCategory.category_id.in_(id_list))
        )
        stmt = stmt.where(or_(Product.category_id.in_(id_list), tag_match))

    # Apply JSONB containment for each attribute
    if attributes_filter:
        for attr_key, attr_value in attributes_filter.items():
            filter_json = {attr_key: attr_value}
            stmt = stmt.where(Product.attributes.contains(filter_json))

    stmt = stmt.where(Product.status == "active").order_by(Product.name.asc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_product(db: AsyncSession, *, data: dict[str, Any]) -> Product:
    data = dict(data)
    sell_price_value = data.pop("sell_price", None)
    sell_price_currency_id = data.pop("sell_price_currency_id", None)
    extra_tags = data.pop("category_ids", None) or []
    category_id = data["category_id"]
    await get_category(db, category_id)
    await _ensure_category_ids_exist(db, {category_id, *{int(x) for x in extra_tags}})
    defs = await _load_merged_attr_defs_for_category(db, category_id)
    attrs = dict(data.get("attributes") or {})
    sell_price = _derive_sell_price(attrs=attrs, sell_price_value=sell_price_value)
    data["attributes"] = _validate_product_attributes(
        attrs=_sync_compat_price(attrs, sell_price=sell_price),
        defs=defs,
    )
    raw_sku = data.get("sku")
    auto_sku = raw_sku is None or (isinstance(raw_sku, str) and raw_sku.strip() == "")
    if auto_sku:
        data["sku"] = f"__AUTO{secrets.token_hex(16)}__"
    elif isinstance(raw_sku, str):
        data["sku"] = raw_sku.strip()
    product = Product(**data)
    db.add(product)
    try:
        await db.flush()
        if auto_sku:
            product.sku = f"PRD-{product.id:09d}"
            await db.flush()
        if _barcode_unset(product.barcode):
            product.barcode = _make_internal_ean13_from_product_id(product.id)
            await db.flush()
        await sync_product_category_links(
            db,
            product_id=product.id,
            primary_category_id=product.category_id,
            extra_category_ids=list(extra_tags),
            merge_existing=False,
        )
        if sell_price is not None:
            await set_product_sell_price(
                db,
                product_id=product.id,
                amount=sell_price,
                currency_id=sell_price_currency_id,
            )
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
    category_id = data.get("category_id", product.category_id)
    await get_category(db, category_id)
    if extra_tags is not _UNSET:
        await _ensure_category_ids_exist(
            db, {int(category_id), *{int(x) for x in (extra_tags or [])}}
        )
    defs = await _load_merged_attr_defs_for_category(db, category_id)

    sell_price: Decimal | None = None
    if (
        ("attributes" in data and data["attributes"] is not None)
        or sell_price_value is not _UNSET
        or has_sell_price_currency
    ):
        attrs = (
            dict(data["attributes"])
            if "attributes" in data and data["attributes"] is not None
            else dict(product.attributes or {})
        )
        existing_compat_price = (product.attributes or {}).get(PRICE_COMPAT_KEY)
        if PRICE_COMPAT_KEY not in attrs and existing_compat_price is not None:
            attrs[PRICE_COMPAT_KEY] = existing_compat_price

        explicit_sell_price = None if sell_price_value is _UNSET else sell_price_value
        sell_price = _derive_sell_price(attrs=attrs, sell_price_value=explicit_sell_price)
        data["attributes"] = _validate_product_attributes(
            attrs=_sync_compat_price(attrs, sell_price=sell_price),
            defs=defs,
        )

    for k, v in data.items():
        setattr(product, k, v)
    try:
        await db.flush()
        if _barcode_unset(product.barcode):
            product.barcode = _make_internal_ean13_from_product_id(product.id)
            await db.flush()
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


async def generate_product_barcode(db: AsyncSession, *, product_id: int) -> Product:
    product = await get_product(db, product_id)
    if product.barcode:
        return product
    barcode = _make_internal_ean13_from_product_id(product.id)
    product.barcode = barcode
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
