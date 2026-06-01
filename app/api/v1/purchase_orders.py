"""Purchase Orders API (Epic 2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.purchase_orders import (
    PurchaseOrderCreate,
    PurchaseOrderListResponse,
    PurchaseOrderRead,
    PurchaseOrderSendRequest,
    PurchaseOrderUpdate,
)
from app.services import audit_service
from app.services.purchase_order_send_service import send_purchase_order_to_supplier
from app.services.purchase_order_service import (
    count_pos,
    create_po,
    get_po,
    list_pos,
    mark_po_cancelled,
    mark_po_closed,
    mark_po_tracked,
    purchase_order_to_read_one,
    purchase_orders_to_read,
    update_po,
)
from app.utils.request_locale import resolve_request_locale

router = APIRouter()


@router.post(
    "/purchase-orders", response_model=PurchaseOrderRead, status_code=status.HTTP_201_CREATED
)
async def create_po_endpoint(
    body: PurchaseOrderCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "create"),
) -> PurchaseOrderRead:
    po = await create_po(db, created_by_user_id=current_user.id, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="purchase_order.created",
        resource_type="purchase_order",
        resource_id=str(po.id),
        new_value=PurchaseOrderRead.model_validate(po).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await purchase_order_to_read_one(db, po)


@router.get("/purchase-orders", response_model=PurchaseOrderListResponse)
async def list_pos_endpoint(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("purchase_orders", "read"),
) -> PurchaseOrderListResponse:
    total = await count_pos(db, status=status)
    rows = await list_pos(db, limit=limit, offset=offset, status=status)
    items = await purchase_orders_to_read(db, rows)
    return PurchaseOrderListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderRead)
async def get_po_endpoint(
    po_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("purchase_orders", "read"),
) -> PurchaseOrderRead:
    po = await get_po(db, po_id)
    return await purchase_order_to_read_one(db, po)


@router.patch("/purchase-orders/{po_id}", response_model=PurchaseOrderRead)
async def update_po_endpoint(
    po_id: int,
    body: PurchaseOrderUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "update"),
) -> PurchaseOrderRead:
    po = await update_po(db, po_id=po_id, data=body.model_dump(exclude_unset=True))
    await audit_service.log(
        session=db,
        action="purchase_order.updated",
        resource_type="purchase_order",
        resource_id=str(po.id),
        new_value=PurchaseOrderRead.model_validate(po).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await purchase_order_to_read_one(db, po)


@router.post("/purchase-orders/{po_id}/send", response_model=PurchaseOrderRead)
async def send_po_endpoint(
    request: Request,
    po_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "update"),
    body: PurchaseOrderSendRequest = PurchaseOrderSendRequest(),
) -> PurchaseOrderRead:
    prev = await get_po(db, po_id)
    prev_status = prev.status
    locale = resolve_request_locale(request.headers.get("accept-language"))
    po = await send_purchase_order_to_supplier(
        db,
        po_id=po_id,
        idempotency_key=body.idempotency_key,
        locale=locale,
    )
    if prev_status != "sent":
        await audit_service.log(
            session=db,
            action="purchase_order.sent",
            resource_type="purchase_order",
            resource_id=str(po.id),
            new_value=PurchaseOrderRead.model_validate(po).model_dump(),
            user_id=current_user.id,
            request=request,
        )
        await db.commit()
    return await purchase_order_to_read_one(db, po)


@router.post("/purchase-orders/{po_id}/track", response_model=PurchaseOrderRead)
async def track_po_endpoint(
    po_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "update"),
) -> PurchaseOrderRead:
    po = await mark_po_tracked(db, po_id=po_id)
    await audit_service.log(
        session=db,
        action="purchase_order.tracked",
        resource_type="purchase_order",
        resource_id=str(po.id),
        new_value=PurchaseOrderRead.model_validate(po).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await purchase_order_to_read_one(db, po)


@router.post("/purchase-orders/{po_id}/cancel", response_model=PurchaseOrderRead)
async def cancel_po_endpoint(
    po_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "update"),
) -> PurchaseOrderRead:
    po = await mark_po_cancelled(db, po_id=po_id)
    await audit_service.log(
        session=db,
        action="purchase_order.cancelled",
        resource_type="purchase_order",
        resource_id=str(po.id),
        new_value=PurchaseOrderRead.model_validate(po).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await purchase_order_to_read_one(db, po)


@router.post("/purchase-orders/{po_id}/close", response_model=PurchaseOrderRead)
async def close_po_endpoint(
    po_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "update"),
) -> PurchaseOrderRead:
    po = await mark_po_closed(db, po_id=po_id)
    await audit_service.log(
        session=db,
        action="purchase_order.closed",
        resource_type="purchase_order",
        resource_id=str(po.id),
        new_value=PurchaseOrderRead.model_validate(po).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await purchase_order_to_read_one(db, po)
