"""Price list CRUD (W-5.3): named lists, branch scope, per-product unit prices."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.price_list import (
    PriceListCreate,
    PriceListLineCreate,
    PriceListLineUpdate,
    PriceListRead,
    PriceListSummaryRead,
    PriceListUpdate,
)
from app.services import audit_service
from app.services.price_list_service import (
    create_price_list,
    delete_line,
    get_price_list,
    list_price_list_summaries,
    patch_line,
    update_price_list,
    upsert_line,
)

router = APIRouter()


@router.get("/price-lists", response_model=list[PriceListSummaryRead])
async def list_price_lists_endpoint(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[PriceListSummaryRead]:
    return await list_price_list_summaries(db, limit=min(max(limit, 1), 200), offset=max(offset, 0))


@router.post("/price-lists", response_model=PriceListRead, status_code=status.HTTP_201_CREATED)
async def create_price_list_endpoint(
    body: PriceListCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> PriceListRead:
    pl = await create_price_list(db, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="price_list.created",
        resource_type="price_list",
        resource_id=str(pl.id),
        new_value=pl.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return pl


@router.get("/price-lists/{price_list_id}", response_model=PriceListRead)
async def get_price_list_endpoint(
    price_list_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> PriceListRead:
    return await get_price_list(db, price_list_id)


@router.patch("/price-lists/{price_list_id}", response_model=PriceListRead)
async def update_price_list_endpoint(
    price_list_id: int,
    body: PriceListUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> PriceListRead:
    pl = await update_price_list(
        db, price_list_id=price_list_id, data=body.model_dump(exclude_unset=True)
    )
    await audit_service.log(
        session=db,
        action="price_list.updated",
        resource_type="price_list",
        resource_id=str(pl.id),
        new_value=pl.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return pl


@router.post(
    "/price-lists/{price_list_id}/lines",
    response_model=PriceListRead,
    status_code=status.HTTP_200_OK,
)
async def add_or_replace_line_endpoint(
    price_list_id: int,
    body: PriceListLineCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> PriceListRead:
    pl = await upsert_line(
        db,
        price_list_id=price_list_id,
        line_id=None,
        product_id=body.product_id,
        unit_price=body.unit_price,
        currency_id=body.currency_id,
    )
    await audit_service.log(
        session=db,
        action="price_list.line_upserted",
        resource_type="price_list",
        resource_id=str(price_list_id),
        new_value=body.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return pl


@router.patch(
    "/price-lists/{price_list_id}/lines/{line_id}",
    response_model=PriceListRead,
)
async def patch_line_endpoint(
    price_list_id: int,
    line_id: int,
    body: PriceListLineUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> PriceListRead:
    pl = await patch_line(db, price_list_id=price_list_id, line_id=line_id, data=body)
    await audit_service.log(
        session=db,
        action="price_list.line_patched",
        resource_type="price_list",
        resource_id=str(price_list_id),
        new_value=body.model_dump(exclude_unset=True),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return pl


@router.delete(
    "/price-lists/{price_list_id}/lines/{line_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_line_endpoint(
    price_list_id: int,
    line_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> None:
    await delete_line(db, price_list_id=price_list_id, line_id=line_id)
    await audit_service.log(
        session=db,
        action="price_list.line_deleted",
        resource_type="price_list",
        resource_id=str(price_list_id),
        new_value={"line_id": line_id},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
