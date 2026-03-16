"""Catalog service: categories, dynamic attribute definitions, products, barcodes."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.category import Category
from app.models.category_attribute_def import CategoryAttributeDef
from app.models.product import Product


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
    result = await db.execute(select(Category).order_by(Category.sort_order.asc(), Category.name.asc()))
    return list(result.scalars().all())


def build_category_tree(categories: Iterable[Category]) -> list[Category]:
    by_parent: dict[int | None, list[Category]] = {}
    by_id: dict[int, Category] = {}
    for c in categories:
        by_id[c.id] = c
        by_parent.setdefault(c.parent_id, []).append(c)
    for children in by_parent.values():
        children.sort(key=lambda x: (x.sort_order, x.name))
    roots = by_parent.get(None, [])

    # Attach a transient attribute `children` for response shaping.
    for c in by_id.values():
        setattr(c, "children", by_parent.get(c.id, []))
    return roots


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


async def list_category_attribute_defs(db: AsyncSession, *, category_id: int) -> list[CategoryAttributeDef]:
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
        raise ConflictError("Attribute definition already exists", details={"key": data.get("key")}) from e
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
    unknown_keys = sorted([k for k in attrs.keys() if k not in allowed])
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
        spec = allowed[key].type.lower()
        if value is None:
            continue
        if spec in {"text", "string"} and not isinstance(value, str):
            raise ValidationError("Invalid attribute type", details={"key": key, "expected": "string"})
        if spec in {"int", "integer"} and not isinstance(value, int):
            raise ValidationError("Invalid attribute type", details={"key": key, "expected": "int"})
        if spec in {"float", "number"} and not isinstance(value, (int, float)):
            raise ValidationError("Invalid attribute type", details={"key": key, "expected": "float"})
        if spec in {"bool", "boolean"} and not isinstance(value, bool):
            raise ValidationError("Invalid attribute type", details={"key": key, "expected": "bool"})
    return attrs


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
    category_id = data["category_id"]
    await get_category(db, category_id)
    defs = await _load_attr_defs(db, category_id)
    attrs = data.get("attributes") or {}
    data["attributes"] = _validate_product_attributes(attrs=attrs, defs=defs)
    product = Product(**data)
    db.add(product)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Product conflicts with existing data", details={"error": str(e.orig)}) from e
    await db.refresh(product)
    return product


async def update_product(db: AsyncSession, *, product_id: int, data: dict[str, Any]) -> Product:
    product = await get_product(db, product_id)
    category_id = data.get("category_id", product.category_id)
    await get_category(db, category_id)
    defs = await _load_attr_defs(db, category_id)

    if "attributes" in data and data["attributes"] is not None:
        data["attributes"] = _validate_product_attributes(attrs=data["attributes"], defs=defs)

    for k, v in data.items():
        setattr(product, k, v)
    try:
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

