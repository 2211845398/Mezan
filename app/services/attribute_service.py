"""Global catalog attribute and value master data."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue
from app.schemas.attributes import (
    CatalogAttributeCreate,
    CatalogAttributeRead,
    CatalogAttributeUpdate,
    CatalogAttributeValueCreate,
    CatalogAttributeValueRead,
    CatalogAttributeValueUpdate,
)
from app.utils.attribute_code import normalize_attribute_code


async def list_attributes(db: AsyncSession) -> list[CatalogAttributeRead]:
    res = await db.execute(
        select(CatalogAttribute).order_by(
            CatalogAttribute.sort_order.asc(),
            CatalogAttribute.name.asc(),
        )
    )
    return [CatalogAttributeRead.from_orm_row(r) for r in res.scalars().all()]


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
    return [CatalogAttributeValueRead.from_orm_row(r) for r in res.scalars().all()]


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
    return CatalogAttributeValueRead.from_orm_row(row)
