"""Global catalog attribute and value master data."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue
from app.models.product_attribute_line_value import ProductAttributeLineValue
from app.models.product_variant_attribute import ProductVariantAttribute
from app.schemas.attributes import (
    CatalogAttributeCreate,
    CatalogAttributeRead,
    CatalogAttributeUpdate,
    CatalogAttributeValueCreate,
    CatalogAttributeValueMergeRequest,
    CatalogAttributeValueRead,
    CatalogAttributeValueUpdate,
)
from app.services.variant_attribute_service import sync_variant_jsonb_cache
from app.utils.attribute_code import normalize_attribute_code


async def _attribute_value_usage_count(db: AsyncSession, value_id: int) -> int:
    line_res = await db.execute(
        select(func.count())
        .select_from(ProductAttributeLineValue)
        .where(ProductAttributeLineValue.attribute_value_id == value_id)
    )
    pivot_res = await db.execute(
        select(func.count())
        .select_from(ProductVariantAttribute)
        .where(ProductVariantAttribute.attribute_value_id == value_id)
    )
    return int(line_res.scalar_one() or 0) + int(pivot_res.scalar_one() or 0)


async def list_attributes(db: AsyncSession) -> list[CatalogAttributeRead]:
    res = await db.execute(
        select(CatalogAttribute).order_by(
            CatalogAttribute.sort_order.asc(),
            CatalogAttribute.name.asc(),
        )
    )
    rows = list(res.scalars().all())
    out: list[CatalogAttributeRead] = []
    for row in rows:
        cnt_res = await db.execute(
            select(func.count())
            .select_from(CatalogAttributeValue)
            .where(CatalogAttributeValue.attribute_id == row.id)
        )
        dto = CatalogAttributeRead.from_orm_row(row)
        out.append(dto.model_copy(update={"value_count": int(cnt_res.scalar_one() or 0)}))
    return out


async def get_attribute(db: AsyncSession, attribute_id: int) -> CatalogAttribute:
    res = await db.execute(select(CatalogAttribute).where(CatalogAttribute.id == attribute_id))
    row = res.scalar_one_or_none()
    if not row:
        raise NotFoundError("Attribute not found", details={"attribute_id": attribute_id})
    return row


async def create_attribute(db: AsyncSession, body: CatalogAttributeCreate) -> CatalogAttributeRead:
    code = body.code or normalize_attribute_code(body.name)
    if not code:
        raise ValidationError("Attribute code is required", details={})
    dup = await db.execute(select(CatalogAttribute).where(CatalogAttribute.code == code))
    if dup.scalar_one_or_none():
        raise ConflictError("Attribute code already exists", details={"code": code})
    now = datetime.now(UTC)
    row = CatalogAttribute(
        code=code,
        name=body.name.strip(),
        sort_order=body.sort_order,
        metadata_=body.metadata,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Attribute conflicts with existing data", details={}) from e
    return CatalogAttributeRead.from_orm_row(row)


async def update_attribute(
    db: AsyncSession, attribute_id: int, body: CatalogAttributeUpdate
) -> CatalogAttributeRead:
    row = await get_attribute(db, attribute_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = data["sort_order"]
    if "metadata" in data:
        row.metadata_ = data["metadata"]
    row.updated_at = datetime.now(UTC)
    await db.flush()
    return CatalogAttributeRead.from_orm_row(row)


async def list_attribute_values(
    db: AsyncSession, attribute_id: int
) -> list[CatalogAttributeValueRead]:
    await get_attribute(db, attribute_id)
    res = await db.execute(
        select(CatalogAttributeValue)
        .where(CatalogAttributeValue.attribute_id == attribute_id)
        .order_by(
            CatalogAttributeValue.sort_order.asc(),
            CatalogAttributeValue.label.asc(),
        )
    )
    out: list[CatalogAttributeValueRead] = []
    for r in res.scalars().all():
        usage = await _attribute_value_usage_count(db, int(r.id))
        dto = CatalogAttributeValueRead.from_orm_row(r)
        out.append(dto.model_copy(update={"usage_count": usage}))
    return out


async def get_attribute_value(db: AsyncSession, value_id: int) -> CatalogAttributeValue:
    res = await db.execute(
        select(CatalogAttributeValue).where(CatalogAttributeValue.id == value_id)
    )
    row = res.scalar_one_or_none()
    if not row:
        raise NotFoundError("Attribute value not found", details={"attribute_value_id": value_id})
    return row


async def create_attribute_value(
    db: AsyncSession, attribute_id: int, body: CatalogAttributeValueCreate
) -> CatalogAttributeValueRead:
    attr = await get_attribute(db, attribute_id)
    code = body.code or normalize_attribute_code(body.label)
    if not code:
        raise ValidationError("Value code is required", details={})
    dup = await db.execute(
        select(CatalogAttributeValue).where(
            CatalogAttributeValue.attribute_id == attr.id,
            CatalogAttributeValue.code == code,
        )
    )
    if dup.scalar_one_or_none():
        raise ConflictError(
            "Attribute value code already exists for this attribute",
            details={"attribute_id": attribute_id, "code": code},
        )
    now = datetime.now(UTC)
    row = CatalogAttributeValue(
        attribute_id=attr.id,
        code=code,
        label=body.label.strip(),
        sort_order=body.sort_order,
        metadata_=body.metadata,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as e:
        raise ConflictError("Attribute value conflicts with existing data", details={}) from e
    return CatalogAttributeValueRead.from_orm_row(row)


async def update_attribute_value(
    db: AsyncSession, attribute_id: int, value_id: int, body: CatalogAttributeValueUpdate
) -> CatalogAttributeValueRead:
    row = await get_attribute_value(db, value_id)
    if row.attribute_id != attribute_id:
        raise ValidationError(
            "Value does not belong to attribute",
            details={"attribute_id": attribute_id, "attribute_value_id": value_id},
        )
    data = body.model_dump(exclude_unset=True)
    if "label" in data and data["label"] is not None:
        row.label = data["label"].strip()
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = data["sort_order"]
    if "metadata" in data:
        row.metadata_ = data["metadata"]
    row.updated_at = datetime.now(UTC)
    await db.flush()
    usage = await _attribute_value_usage_count(db, int(row.id))
    dto = CatalogAttributeValueRead.from_orm_row(row)
    return dto.model_copy(update={"usage_count": usage})


async def delete_attribute(db: AsyncSession, attribute_id: int) -> None:
    row = await get_attribute(db, attribute_id)
    val_res = await db.execute(
        select(CatalogAttributeValue.id).where(CatalogAttributeValue.attribute_id == row.id)
    )
    for vid in val_res.scalars().all():
        if await _attribute_value_usage_count(db, int(vid)) > 0:
            raise ConflictError(
                "Cannot delete attribute while values are in use",
                details={"attribute_id": attribute_id, "attribute_value_id": int(vid)},
            )
    await db.execute(
        delete(CatalogAttributeValue).where(CatalogAttributeValue.attribute_id == row.id)
    )
    await db.delete(row)
    await db.flush()


async def delete_attribute_value(
    db: AsyncSession, attribute_id: int, value_id: int
) -> None:
    row = await get_attribute_value(db, value_id)
    if row.attribute_id != attribute_id:
        raise ValidationError(
            "Value does not belong to attribute",
            details={"attribute_id": attribute_id, "attribute_value_id": value_id},
        )
    if await _attribute_value_usage_count(db, value_id) > 0:
        raise ConflictError(
            "Cannot delete attribute value while it is in use",
            details={"attribute_value_id": value_id},
        )
    await db.delete(row)
    await db.flush()


async def merge_attribute_values(
    db: AsyncSession, attribute_id: int, body: CatalogAttributeValueMergeRequest
) -> CatalogAttributeValueRead:
    target = await get_attribute_value(db, body.target_value_id)
    if target.attribute_id != attribute_id:
        raise ValidationError(
            "Target value does not belong to attribute",
            details={"attribute_id": attribute_id, "attribute_value_id": body.target_value_id},
        )
    source_ids = [int(v) for v in body.source_value_ids if int(v) != int(target.id)]
    if not source_ids:
        raise ValidationError("No source values to merge", details={})

    for sid in source_ids:
        src = await get_attribute_value(db, sid)
        if src.attribute_id != attribute_id:
            raise ValidationError(
                "Source value does not belong to attribute",
                details={"attribute_id": attribute_id, "attribute_value_id": sid},
            )

    affected_variant_ids: set[int] = set()

    line_res = await db.execute(
        select(ProductAttributeLineValue).where(
            ProductAttributeLineValue.attribute_value_id.in_(source_ids)
        )
    )
    for line_val in line_res.scalars().all():
        dup = await db.execute(
            select(ProductAttributeLineValue.id).where(
                ProductAttributeLineValue.line_id == line_val.line_id,
                ProductAttributeLineValue.attribute_value_id == int(target.id),
            )
        )
        if dup.scalar_one_or_none() is not None:
            await db.delete(line_val)
        else:
            line_val.attribute_value_id = int(target.id)

    for sid in source_ids:
        pivot_res = await db.execute(
            select(ProductVariantAttribute).where(
                ProductVariantAttribute.attribute_value_id == sid
            )
        )
        for pva in pivot_res.scalars().all():
            affected_variant_ids.add(int(pva.variant_id))
            existing_target = await db.execute(
                select(ProductVariantAttribute.id).where(
                    ProductVariantAttribute.variant_id == pva.variant_id,
                    ProductVariantAttribute.attribute_id == pva.attribute_id,
                    ProductVariantAttribute.attribute_value_id == int(target.id),
                )
            )
            if existing_target.scalar_one_or_none() is not None:
                await db.delete(pva)
            else:
                pva.attribute_value_id = int(target.id)

    for sid in source_ids:
        src_row = await get_attribute_value(db, sid)
        await db.delete(src_row)

    await db.flush()
    for vid in affected_variant_ids:
        await sync_variant_jsonb_cache(db, vid)

    usage = await _attribute_value_usage_count(db, int(target.id))
    dto = CatalogAttributeValueRead.from_orm_row(target)
    return dto.model_copy(update={"usage_count": usage})
