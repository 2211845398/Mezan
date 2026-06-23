"""Ad-hoc receipt, reservations, and stock-count export."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.inventory_human_movement import (
    HumanInventoryMovementResponse,
)
from app.schemas.inventory_operations import (
    AdhocGoodsReceiptCreate,
    AdhocGoodsReceiptResponse,
    DamagedActionCreate,
    DamagedPositionRead,
    ReservationRead,
    ReservationReleaseCreate,
    StockCountExportRequest,
)
from app.schemas.stock_count import (
    StockCountLinesPatch,
    StockCountPostResult,
    StockCountSessionCreate,
    StockCountSessionDetailRead,
    StockCountSessionRead,
)
from app.services import audit_service
from app.services.adhoc_goods_receipt_service import receive_adhoc_goods
from app.services.branch_scope import require_branch_open_for_operations
from app.services.inventory_damage_service import (
    list_damaged_positions,
    scrap_damaged_position,
    unmark_damaged_position,
)
from app.services.inventory_reservation_service import list_open_reservations, release_reservation
from app.services.stock_count_pdf_service import (
    export_stock_count_pdf,
    export_stock_count_pdf_from_session,
)
from app.services.stock_count_session_service import (
    cancel_stock_count_session,
    create_stock_count_session,
    get_stock_count_session,
    list_stock_count_sessions,
    patch_stock_count_lines,
    post_stock_count_session,
)
from app.core.config import settings
from app.services.notifications.service import (
    dispatch_delivery_after_commit,
    enqueue_direct_notification,
)
from app.services.realtime_nav_badges import emit_notifications_unread_for_user
from app.utils.content_disposition import attachment_content_disposition
from app.utils.request_locale import resolve_request_locale

router = APIRouter()


@router.post("/inventory/receipts/adhoc", response_model=AdhocGoodsReceiptResponse)
async def create_adhoc_goods_receipt(
    body: AdhocGoodsReceiptCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("stock_adjustments", "create"),
) -> AdhocGoodsReceiptResponse:
    await require_branch_open_for_operations(db, body.branch_id)
    movement_ids = await receive_adhoc_goods(
        db,
        user_id=current_user.id,
        idempotency_key=body.idempotency_key,
        branch_id=body.branch_id,
        lines=[ln.model_dump() for ln in body.lines],
        supplier_id=body.supplier_id,
        notes=body.notes,
    )
    await audit_service.log(
        session=db,
        action="inventory.adhoc_receipt",
        resource_type="stock_movement",
        resource_id=",".join(str(i) for i in movement_ids),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return AdhocGoodsReceiptResponse(movement_ids=movement_ids)


@router.get("/inventory/reservations", response_model=list[ReservationRead])
async def list_reservations_endpoint(
    branch_id: int | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("stock_adjustments", "read"),
) -> list[ReservationRead]:
    return await list_open_reservations(db, branch_id=branch_id, limit=limit)


@router.post(
    "/inventory/reservations/{reserve_movement_id}/release",
    response_model=HumanInventoryMovementResponse,
)
async def release_reservation_endpoint(
    reserve_movement_id: int,
    body: ReservationReleaseCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("stock_adjustments", "create"),
) -> HumanInventoryMovementResponse:
    reserve_mv = await release_reservation(
        db,
        user_id=current_user.id,
        reserve_movement_id=reserve_movement_id,
        idempotency_key=body.idempotency_key,
        quantity=body.quantity,
        notes=body.notes,
    )
    await audit_service.log(
        session=db,
        action="inventory.reservation.released",
        resource_type="stock_movement",
        resource_id=str(reserve_mv.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return HumanInventoryMovementResponse(movement_id=reserve_mv.id)


@router.get("/inventory/damaged", response_model=list[DamagedPositionRead])
async def list_damaged_endpoint(
    branch_id: int | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("stock_adjustments", "read"),
) -> list[DamagedPositionRead]:
    return await list_damaged_positions(db, branch_id=branch_id, limit=limit)


@router.post("/inventory/damaged/scrap", response_model=HumanInventoryMovementResponse)
async def scrap_damaged_endpoint(
    body: DamagedActionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("stock_adjustments", "create"),
) -> HumanInventoryMovementResponse:
    await require_branch_open_for_operations(db, body.branch_id)
    mv = await scrap_damaged_position(
        db,
        user_id=current_user.id,
        idempotency_key=body.idempotency_key,
        branch_id=body.branch_id,
        product_id=body.product_id,
        variant_id=body.variant_id,
        quantity=body.quantity,
        uom_id=body.uom_id,
        notes=body.notes,
    )
    await audit_service.log(
        session=db,
        action="inventory.damage.scrapped",
        resource_type="stock_movement",
        resource_id=str(mv.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return HumanInventoryMovementResponse(movement_id=mv.id)


@router.post("/inventory/damaged/unmark", response_model=HumanInventoryMovementResponse)
async def unmark_damaged_endpoint(
    body: DamagedActionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("stock_adjustments", "create"),
) -> HumanInventoryMovementResponse:
    await require_branch_open_for_operations(db, body.branch_id)
    mv = await unmark_damaged_position(
        db,
        user_id=current_user.id,
        idempotency_key=body.idempotency_key,
        branch_id=body.branch_id,
        product_id=body.product_id,
        variant_id=body.variant_id,
        quantity=body.quantity,
        uom_id=body.uom_id,
        notes=body.notes,
    )
    await audit_service.log(
        session=db,
        action="inventory.damage.unmarked",
        resource_type="stock_movement",
        resource_id=str(mv.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return HumanInventoryMovementResponse(movement_id=mv.id)


@router.get("/inventory/stock-count/sessions", response_model=list[StockCountSessionRead])
async def list_stock_count_sessions_endpoint(
    branch_id: int | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[StockCountSessionRead]:
    return await list_stock_count_sessions(db, branch_id=branch_id, limit=limit)


@router.post("/inventory/stock-count/sessions", response_model=StockCountSessionDetailRead)
async def create_stock_count_session_endpoint(
    body: StockCountSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> StockCountSessionDetailRead:
    await require_branch_open_for_operations(db, body.branch_id)
    detail = await create_stock_count_session(
        db,
        user_id=current_user.id,
        branch_id=body.branch_id,
        category_id=body.category_id,
        category_include_descendants=body.category_include_descendants,
        product_ids=body.product_ids,
        responsible_name=body.responsible_name,
        assigned_user_id=body.assigned_user_id,
    )
    delivery_id = await enqueue_direct_notification(
        db,
        user_id=body.assigned_user_id,
        title="تم تعيين جرد مخزني لك",
        body=f"تم إصدار جرد مخزني (رقم {detail.id}) في فرع {detail.branch_name}. يمكنك تنزيله وتعبئته من صفحة جردي.",
        template_kind="stock_count_assigned",
        idempotency_key=f"stock_count_assigned:{detail.id}",
        data={"stock_count_session_id": detail.id, "path": f"/my-stock-count/{detail.id}"},
        provider_name=None,
        default_push_provider=settings.PUSH_PROVIDER,
    )
    await db.commit()
    if delivery_id is not None:
        await dispatch_delivery_after_commit(
            delivery_id, default_push_provider=settings.PUSH_PROVIDER
        )
        await emit_notifications_unread_for_user(body.assigned_user_id)
    return detail


@router.delete(
    "/inventory/stock-count/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_stock_count_session_endpoint(
    session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> None:
    session = await get_stock_count_session(db, session_id=session_id)
    await cancel_stock_count_session(db, session_id=session_id)
    await audit_service.log(
        session=db,
        action="stock_count_session.cancelled",
        resource_type="stock_count_session",
        resource_id=str(session_id),
        new_value={
            "session_id": session_id,
            "branch_id": session.branch_id,
            "version_no": session.version_no,
        },
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


@router.get(
    "/inventory/stock-count/sessions/{session_id}", response_model=StockCountSessionDetailRead
)
async def get_stock_count_session_endpoint(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> StockCountSessionDetailRead:
    return await get_stock_count_session(db, session_id=session_id)


@router.get("/inventory/stock-count/sessions/{session_id}/pdf")
async def export_stock_count_session_pdf_endpoint(
    session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> Response:
    locale = resolve_request_locale(request.headers.get("accept-language"))
    pdf_bytes, filename = await export_stock_count_pdf_from_session(
        db, session_id=session_id, locale=locale
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": attachment_content_disposition(filename)},
    )


@router.patch(
    "/inventory/stock-count/sessions/{session_id}/lines", response_model=StockCountSessionDetailRead
)
async def patch_stock_count_lines_endpoint(
    session_id: int,
    body: StockCountLinesPatch,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("inventory", "update"),
) -> StockCountSessionDetailRead:
    detail = await patch_stock_count_lines(db, session_id=session_id, updates=body.lines)
    await db.commit()
    return detail


@router.post(
    "/inventory/stock-count/sessions/{session_id}/post", response_model=StockCountPostResult
)
async def post_stock_count_session_endpoint(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> StockCountPostResult:
    result = await post_stock_count_session(db, user_id=current_user.id, session_id=session_id)
    await db.commit()
    return result


@router.post("/inventory/stock-count/export")
async def export_stock_count_endpoint(
    body: StockCountExportRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "read"),
) -> Response:
    await require_branch_open_for_operations(db, body.branch_id)
    locale = resolve_request_locale(request.headers.get("accept-language"))
    pdf_bytes, filename = await export_stock_count_pdf(
        db,
        branch_id=body.branch_id,
        category_id=body.category_id,
        category_include_descendants=body.category_include_descendants,
        product_ids=body.product_ids,
        q=body.q,
        responsible_name=body.responsible_name or (current_user.email or ""),
        locale=locale,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": attachment_content_disposition(filename)},
    )
