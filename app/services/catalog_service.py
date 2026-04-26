"""Catalog service: categories, dynamic attribute definitions, products, barcodes."""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.category import Category
from app.models.category_attribute_def import CategoryAttributeDef
from app.models.product import Product
from app.schemas.catalog import CategoryTreeNode
from app.services.pricing_service import set_product_sell_price
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


def build_category_tree_nodes(categories: Iterable[Category]) -> list[CategoryTreeNode]:
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
        return CategoryTreeNode(
            id=c.id,
            name=c.name,
            slug=c.slug,
            sort_order=c.sort_order,
            is_active=c.is_active,
            parent_id=c.parent_id,
            created_at=c.created_at,
            updated_at=c.updated_at,
            children=[to_node(ch) for ch in kids],
        )

    return [to_node(r) for r in by_parent.get(None, [])]


async def create_category(db: AsyncSession, *, data: dict[str, Any]) -> Category:
    parent_id = data.get("parent_id")
    if parent_id is not None:
        await get_category(db, parent_id)
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
    category = await get_category(db, category_id)
    if "parent_id" in data:
        new_parent_id = data["parent_id"]
        if new_parent_id == category_id:
            raise ValidationError("Category cannot be its own parent")
        if new_parent_id is not None:
            await get_category(db, new_parent_id)
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


async def create_category_attribute_def(
    db: AsyncSession, *, category_id: int, data: dict[str, Any]
) -> CategoryAttributeDef:
    await get_category(db, category_id)
    rec = CategoryAttributeDef(category_id=category_id, **data)
    db.add(rec)
    try:
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
    for k, v in data.items():
        setattr(rec, k, v)
    await db.commit()
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
    await db.delete(rec)
    await db.commit()


async def _load_attr_defs(db: AsyncSession, category_id: int) -> list[CategoryAttributeDef]:
    result = await db.execute(
        select(CategoryAttributeDef).where(CategoryAttributeDef.category_id == category_id)
    )
    return list(result.scalars().all())


def _validate_product_attributes(
    *, attrs: dict[str, Any], defs: list[CategoryAttributeDef]
) -> dict[str, Any]:
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
        spec = allowed[key].type.lower()
        if value is None:
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
        synced[PRICE_COMPAT_KEY] = float(sell_price)
    return synced


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
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Product]:
    stmt: Select[tuple[Product]] = select(Product)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if status is not None:
        stmt = stmt.where(Product.status == status)
    stmt = stmt.order_by(Product.id.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_product(db: AsyncSession, *, data: dict[str, Any]) -> Product:
    data = dict(data)
    sell_price_value = data.pop("sell_price", None)
    sell_price_currency_id = data.pop("sell_price_currency_id", None)
    category_id = data["category_id"]
    await get_category(db, category_id)
    defs = await _load_attr_defs(db, category_id)
    attrs = dict(data.get("attributes") or {})
    sell_price = _derive_sell_price(attrs=attrs, sell_price_value=sell_price_value)
    data["attributes"] = _validate_product_attributes(
        attrs=_sync_compat_price(attrs, sell_price=sell_price),
        defs=defs,
    )
    product = Product(**data)
    db.add(product)
    try:
        await db.flush()
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
    category_id = data.get("category_id", product.category_id)
    await get_category(db, category_id)
    defs = await _load_attr_defs(db, category_id)

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
