"""Global catalog attributes API."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.attributes import (
    CatalogAttributeCreate,
    CatalogAttributeRead,
    CatalogAttributeUpdate,
    CatalogAttributeValueCreate,
    CatalogAttributeValueRead,
    CatalogAttributeValueUpdate,
)
from app.services import audit_service
from app.services.attribute_service import (
    create_attribute,
    create_attribute_value,
    get_attribute,
    list_attribute_values,
    list_attributes,
    update_attribute,
    update_attribute_value,
)

router = APIRouter()


@router.get("/catalog/attributes", response_model=list[CatalogAttributeRead])
async def list_attributes_endpoint(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[CatalogAttributeRead]:
    return await list_attributes(db)


@router.post(
    "/catalog/attributes",
    response_model=CatalogAttributeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_attribute_endpoint(
    body: CatalogAttributeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "create"),
) -> CatalogAttributeRead:
    row = await create_attribute(db, body)
    await audit_service.log(
        session=db,
        action="catalog_attribute.create",
        resource_type="catalog_attribute",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
        details={"code": row.code},
    )
    await db.commit()
    return row


@router.patch("/catalog/attributes/{attribute_id}", response_model=CatalogAttributeRead)
async def update_attribute_endpoint(
    attribute_id: int,
    body: CatalogAttributeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> CatalogAttributeRead:
    row = await update_attribute(db, attribute_id, body)
    await audit_service.log(
        session=db,
        action="catalog_attribute.update",
        resource_type="catalog_attribute",
        resource_id=str(attribute_id),
        user_id=current_user.id,
        request=request,
        details={},
    )
    await db.commit()
    return row


@router.get(
    "/catalog/attributes/{attribute_id}/values",
    response_model=list[CatalogAttributeValueRead],
)
async def list_attribute_values_endpoint(
    attribute_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[CatalogAttributeValueRead]:
    await get_attribute(db, attribute_id)
    return await list_attribute_values(db, attribute_id)


@router.post(
    "/catalog/attributes/{attribute_id}/values",
    response_model=CatalogAttributeValueRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_attribute_value_endpoint(
    attribute_id: int,
    body: CatalogAttributeValueCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "create"),
) -> CatalogAttributeValueRead:
    row = await create_attribute_value(db, attribute_id, body)
    await audit_service.log(
        session=db,
        action="catalog_attribute_value.create",
        resource_type="catalog_attribute_value",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
        details={"attribute_id": attribute_id, "code": row.code},
    )
    await db.commit()
    return row


@router.patch(
    "/catalog/attributes/{attribute_id}/values/{value_id}",
    response_model=CatalogAttributeValueRead,
)
async def update_attribute_value_endpoint(
    attribute_id: int,
    value_id: int,
    body: CatalogAttributeValueUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> CatalogAttributeValueRead:
    row = await update_attribute_value(db, attribute_id, value_id, body)
    await audit_service.log(
        session=db,
        action="catalog_attribute_value.update",
        resource_type="catalog_attribute_value",
        resource_id=str(value_id),
        user_id=current_user.id,
        request=request,
        details={"attribute_id": attribute_id},
    )
    await db.commit()
    return row
