"""Global catalog attribute and value master data."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_value import CatalogAttributeValue
from app.models.product_attribute_line import ProductAttributeLine
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
from app.utils.sequential_attribute_code import (
    has_arabic_script,
    next_catalog_attribute_code,
    next_catalog_attribute_value_code,
)
from app.utils.smart_sku import (
    is_auto_generated_value_code,
    normalize_sku_segment,
    sku_segment_key,
)


def _validate_explicit_value_code(code: str) -> str:
    """Validate an explicit or Latin-derived SKU-safe value code."""
    if not code:
        raise ValidationError("Value code is required", details={})
    if is_auto_generated_value_code(code):
        raise ValidationError(
            "Enter an English abbreviation (1–4 letters/numbers, e.g. RED, 1M) for variant SKU codes",
            details={"code": "attribute_value_code_ascii_required"},
        )
    if not normalize_sku_segment(code, max_len=64):
        raise ValidationError(
            "Value code must use English letters and numbers only",
            details={"code": code},
        )
    return code


def _resolve_attribute_value_code(body_code: str | None, label: str) -> str:
    """Resolve SKU-safe ASCII value code from explicit code or Latin label (sync updates)."""
    code = (body_code or "").strip() or normalize_attribute_code(label)
    return _validate_explicit_value_code(code)


async def _resolve_attribute_value_code_for_create(
    db: AsyncSession,
    attribute_id: int,
    body_code: str | None,
    label: str,
) -> str:
    """Allocate value code on create: explicit, Latin-derived, or sequential VAL_n."""
    if body_code and str(body_code).strip():
        return _validate_explicit_value_code(normalize_attribute_code(str(body_code)))
    derived = normalize_attribute_code(label)
    if derived and not is_auto_generated_value_code(derived):
        return _validate_explicit_value_code(derived)
    return await next_catalog_attribute_value_code(db, attribute_id)


async def _resolve_attribute_code_for_create(
    db: AsyncSession,
    body_code: str | None,
    name: str,
) -> str:
    """Allocate attribute code on create: explicit, Latin-derived, or sequential ATTR_n."""
    if body_code and str(body_code).strip():
        code = normalize_attribute_code(str(body_code))
    else:
        derived = normalize_attribute_code(name)
        if has_arabic_script(name) or is_auto_generated_value_code(derived):
            code = await next_catalog_attribute_code(db)
        else:
            code = derived or await next_catalog_attribute_code(db)
    if not code:
        raise ValidationError("Attribute code is required", details={})
    return code


async def _attribute_axis_usage_count(db: AsyncSession, attribute_id: int) -> int:
    line_res = await db.execute(
        select(func.count())
        .select_from(ProductAttributeLine)
        .where(ProductAttributeLine.attribute_id == attribute_id)
    )
    pivot_res = await db.execute(
        select(func.count())
        .select_from(ProductVariantAttribute)
        .where(ProductVariantAttribute.attribute_id == attribute_id)
    )
    return int(line_res.scalar_one() or 0) + int(pivot_res.scalar_one() or 0)


async def _assert_unique_sku_segment_within_attribute(
    db: AsyncSession,
    *,
    attribute_id: int,
    code: str,
    exclude_value_id: int | None = None,
) -> None:
    """Reject value codes whose SKU segment collides with a sibling on the same axis."""
    segment = sku_segment_key(code)
    if not segment:
        return
    res = await db.execute(
        select(CatalogAttributeValue).where(CatalogAttributeValue.attribute_id == attribute_id)
    )
    for sibling in res.scalars().all():
        if exclude_value_id is not None and int(sibling.id) == int(exclude_value_id):
            continue
        if sku_segment_key(sibling.code) == segment:
            raise ValidationError(
                "Value code collides with another value on this attribute after SKU truncation",
                details={
                    "code": "sku_segment_collision",
                    "segment": segment,
                    "collides_with": {
                        "attribute_value_id": int(sibling.id),
                        "code": sibling.code,
                        "label": sibling.label,
                    },
                },
            )


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
        usage = await _attribute_axis_usage_count(db, int(row.id))
        dto = CatalogAttributeRead.from_orm_row(row)
        out.append(
            dto.model_copy(
                update={
                    "value_count": int(cnt_res.scalar_one() or 0),
                    "usage_count": usage,
                }
            )
        )
    return out


async def get_attribute(db: AsyncSession, attribute_id: int) -> CatalogAttribute:
    res = await db.execute(select(CatalogAttribute).where(CatalogAttribute.id == attribute_id))
    row = res.scalar_one_or_none()
    if not row:
        raise NotFoundError("Attribute not found", details={"attribute_id": attribute_id})
    return row


async def create_attribute(db: AsyncSession, body: CatalogAttributeCreate) -> CatalogAttributeRead:
    code = await _resolve_attribute_code_for_create(db, body.code, body.name)
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
    if "code" in data and data["code"] is not None:
        new_code = data["code"]
        if new_code != row.code:
            if await _attribute_axis_usage_count(db, attribute_id) > 0:
                raise ConflictError(
                    "Cannot change attribute code while it is in use on products",
                    details={"code": "code_locked", "attribute_id": attribute_id},
                )
            dup = await db.execute(
                select(CatalogAttribute).where(
                    CatalogAttribute.code == new_code,
                    CatalogAttribute.id != attribute_id,
                )
            )
            if dup.scalar_one_or_none():
                raise ConflictError("Attribute code already exists", details={"code": new_code})
            row.code = new_code
    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = data["sort_order"]
    if "metadata" in data:
        row.metadata_ = data["metadata"]
    row.updated_at = datetime.now(UTC)
    await db.flush()
    usage = await _attribute_axis_usage_count(db, attribute_id)
    dto = CatalogAttributeRead.from_orm_row(row)
    return dto.model_copy(update={"usage_count": usage})


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
    code = await _resolve_attribute_value_code_for_create(db, attribute_id, body.code, body.label)
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
    await _assert_unique_sku_segment_within_attribute(db, attribute_id=attr.id, code=code)
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
    if "code" in data and data["code"] is not None:
        new_code = _resolve_attribute_value_code(data["code"], row.label)
        if new_code != row.code:
            if await _attribute_value_usage_count(db, value_id) > 0:
                raise ConflictError(
                    "Cannot change value code while it is in use on products",
                    details={
                        "code": "code_locked",
                        "attribute_id": attribute_id,
                        "attribute_value_id": value_id,
                    },
                )
            dup = await db.execute(
                select(CatalogAttributeValue).where(
                    CatalogAttributeValue.attribute_id == attribute_id,
                    CatalogAttributeValue.code == new_code,
                    CatalogAttributeValue.id != value_id,
                )
            )
            if dup.scalar_one_or_none():
                raise ConflictError(
                    "Attribute value code already exists for this attribute",
                    details={"attribute_id": attribute_id, "code": new_code},
                )
            await _assert_unique_sku_segment_within_attribute(
                db,
                attribute_id=attribute_id,
                code=new_code,
                exclude_value_id=value_id,
            )
            row.code = new_code
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
