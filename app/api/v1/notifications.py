"""Notification API (Epic 13).

Three audiences:
- Authenticated end users register and revoke their own device tokens and read
  their own delivery history.
- Admins manage templates and schedules, and can trigger a run on demand.
- No one writes to deliveries directly through this API; deliveries are emitted
  by the scheduler or by a manual run.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    get_current_user_role_codes,
    get_settings,
    require_any_role,
    require_permission,
)
from app.core.config import Settings
from app.core.notification_rbac import (
    ORG_NOTIFICATION_MANAGER_ROLE_CODES,
    is_company_wide_audience,
    is_company_wide_schedule,
)
from app.db.database import get_db
from app.models.users import User
from app.schemas.notifications import (
    DeviceTokenListResponse,
    DeviceTokenRead,
    DeviceTokenRegisterRequest,
    NotificationBroadcastRequest,
    NotificationBroadcastResponse,
    NotificationDeliveryListResponse,
    NotificationDeliveryRead,
    NotificationMarkReadResponse,
    NotificationRunRead,
    NotificationScheduleListResponse,
    NotificationScheduleRead,
    NotificationScheduleUpsert,
    NotificationTemplateRead,
    NotificationTemplateUpsert,
    NotificationUnreadCountResponse,
    ScheduleTriggerResponse,
)
from app.services import audit_service
from app.services.notifications.service import (
    broadcast_notification,
    count_unread_deliveries,
    delete_all_deliveries,
    delete_read_deliveries,
    delete_schedule,
    get_schedule,
    list_device_tokens,
    list_admin_deliveries_for_viewer,
    list_notification_runs,
    list_recent_deliveries,
    list_schedules,
    list_templates,
    mark_all_deliveries_read,
    mark_delivery_read,
    register_device_token,
    revoke_device_token,
    run_schedule_once,
    upsert_schedule,
    upsert_template,
)

router = APIRouter()


def _normalize_broadcast_targets(body: NotificationBroadcastRequest) -> tuple[list[str], list[int]]:
    """Merge singular ``role_code`` / ``branch_id`` with list fields (unique, capped)."""
    codes: list[str] = []
    for c in body.role_codes or []:
        s = str(c).strip()
        if s and s not in codes:
            codes.append(s)
    if body.role_code:
        s = str(body.role_code).strip()
        if s and s not in codes:
            codes.append(s)

    bids: list[int] = []
    for b in body.branch_ids or []:
        x = int(b)
        if x not in bids:
            bids.append(x)
    if body.branch_id is not None:
        x = int(body.branch_id)
        if x not in bids:
            bids.append(x)
    return codes[:64], bids[:64]


# ── Device tokens (self-service) ─────────────────────────────────────────────


@router.post(
    "/notifications/device-tokens",
    response_model=DeviceTokenRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_device_token_endpoint(
    body: DeviceTokenRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "read"),
) -> DeviceTokenRead:
    row = await register_device_token(
        db,
        user_id=current_user.id,
        platform=body.platform,
        token=body.token,
        device_label=body.device_label,
        app_version=body.app_version,
    )
    await audit_service.log(
        session=db,
        action="notifications.device_token.registered",
        resource_type="device_token",
        resource_id=str(row.id),
        new_value={"platform": body.platform, "device_label": body.device_label},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return DeviceTokenRead.model_validate(row)


@router.get("/notifications/device-tokens", response_model=DeviceTokenListResponse)
async def list_device_tokens_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    __: None = require_permission("notifications", "read"),
) -> DeviceTokenListResponse:
    rows = await list_device_tokens(db, user_id=current_user.id)
    return DeviceTokenListResponse(items=[DeviceTokenRead.model_validate(r) for r in rows])


@router.delete(
    "/notifications/device-tokens/{token_id}",
    response_model=DeviceTokenRead,
)
async def revoke_device_token_endpoint(
    token_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "read"),
) -> DeviceTokenRead:
    row = await revoke_device_token(db, user_id=current_user.id, token_id=token_id)
    await audit_service.log(
        session=db,
        action="notifications.device_token.revoked",
        resource_type="device_token",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return DeviceTokenRead.model_validate(row)


# ── Deliveries (self-service history) ────────────────────────────────────────


@router.get(
    "/notifications/deliveries/me",
    response_model=NotificationDeliveryListResponse,
)
async def my_deliveries_endpoint(
    limit: int = Query(default=50, ge=1, le=200),
    unread_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    __: None = require_permission("notifications", "read"),
) -> NotificationDeliveryListResponse:
    rows = await list_recent_deliveries(
        db,
        user_id=current_user.id,
        limit=limit,
        unread_only=unread_only,
    )
    return NotificationDeliveryListResponse(
        items=[NotificationDeliveryRead.model_validate(r) for r in rows]
    )


@router.get(
    "/notifications/deliveries/me/unread-count",
    response_model=NotificationUnreadCountResponse,
)
async def my_unread_count_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    __: None = require_permission("notifications", "read"),
) -> NotificationUnreadCountResponse:
    count = await count_unread_deliveries(db, user_id=current_user.id)
    return NotificationUnreadCountResponse(unread_count=count)


@router.patch(
    "/notifications/deliveries/{delivery_id}/read",
    response_model=NotificationDeliveryRead,
)
async def mark_delivery_read_endpoint(
    delivery_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    __: None = require_permission("notifications", "read"),
) -> NotificationDeliveryRead:
    row = await mark_delivery_read(db, user_id=current_user.id, delivery_id=delivery_id)
    return NotificationDeliveryRead.model_validate(row)


@router.post(
    "/notifications/deliveries/me/read-all",
    response_model=NotificationMarkReadResponse,
)
async def mark_all_deliveries_read_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    __: None = require_permission("notifications", "read"),
) -> NotificationMarkReadResponse:
    updated = await mark_all_deliveries_read(db, user_id=current_user.id)
    return NotificationMarkReadResponse(updated=updated)


@router.delete(
    "/notifications/deliveries/me/read",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_read_deliveries_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "read"),
) -> None:
    """Delete all read deliveries for the current user."""
    deleted = await delete_read_deliveries(db, user_id=current_user.id)
    await audit_service.log(
        session=db,
        action="notifications.deliveries.clear_read",
        resource_type="notification_delivery",
        resource_id=None,
        new_value={"deleted_count": deleted},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


# ── Admin: templates ─────────────────────────────────────────────────────────


@router.put(
    "/admin/notifications/templates",
    response_model=NotificationTemplateRead,
)
async def upsert_template_endpoint(
    body: NotificationTemplateUpsert,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "update"),
) -> NotificationTemplateRead:
    row = await upsert_template(
        db,
        kind=body.kind,
        title_template=body.title_template,
        body_template=body.body_template,
        default_data=body.default_data,
        is_active=body.is_active,
    )
    await audit_service.log(
        session=db,
        action="notifications.template.upserted",
        resource_type="notification_template",
        resource_id=str(row.id),
        new_value=body.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return NotificationTemplateRead.model_validate(row)


@router.get(
    "/admin/notifications/templates",
    response_model=list[NotificationTemplateRead],
)
async def list_templates_endpoint(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("notifications", "read"),
) -> list[NotificationTemplateRead]:
    rows = await list_templates(db)
    return [NotificationTemplateRead.model_validate(r) for r in rows]


# ── Admin: schedules ─────────────────────────────────────────────────────────


@router.put(
    "/admin/notifications/schedules",
    response_model=NotificationScheduleRead,
)
async def upsert_schedule_endpoint(
    body: NotificationScheduleUpsert,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "update"),
    role_codes: frozenset[str] = Depends(get_current_user_role_codes),
) -> NotificationScheduleRead:
    if is_company_wide_audience(body):
        if not (role_codes & ORG_NOTIFICATION_MANAGER_ROLE_CODES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Company-wide notification routines require Owner, Admin, IT Admin, or HR Manager role."
                ),
            )
    row = await upsert_schedule(
        db,
        name=body.name,
        kind=body.kind,
        interval_minutes=body.interval_minutes,
        target_role_code=body.target_role_code,
        branch_id=body.branch_id,
        parameters=body.parameters,
        is_active=body.is_active,
    )
    await audit_service.log(
        session=db,
        action="notifications.schedule.upserted",
        resource_type="notification_schedule",
        resource_id=str(row.id),
        new_value=body.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return NotificationScheduleRead.model_validate(row)


@router.get(
    "/admin/notifications/schedules",
    response_model=NotificationScheduleListResponse,
)
async def list_schedules_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "read"),
) -> NotificationScheduleListResponse:
    rows = await list_schedules(db, viewer_user_id=current_user.id)
    return NotificationScheduleListResponse(
        items=[NotificationScheduleRead.model_validate(r) for r in rows]
    )


@router.delete(
    "/admin/notifications/schedules/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_schedule_endpoint(
    schedule_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "update"),
    role_codes: frozenset[str] = Depends(get_current_user_role_codes),
) -> None:
    sch = await get_schedule(db, schedule_id=schedule_id)
    if is_company_wide_schedule(sch):
        if not (role_codes & ORG_NOTIFICATION_MANAGER_ROLE_CODES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Deleting company-wide routines requires Owner, Admin, IT Admin, or HR Manager role.",
            )
    snapshot = await delete_schedule(db, schedule_id=schedule_id)
    await audit_service.log(
        session=db,
        action="notifications.schedule.deleted",
        resource_type="notification_schedule",
        resource_id=str(schedule_id),
        old_value=snapshot,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


@router.get(
    "/admin/notifications/runs",
    response_model=list[NotificationRunRead],
)
async def list_notification_runs_endpoint(
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("notifications", "read"),
    __: None = require_any_role(*ORG_NOTIFICATION_MANAGER_ROLE_CODES),
) -> list[NotificationRunRead]:
    rows = await list_notification_runs(db, limit=limit)
    return [NotificationRunRead.model_validate(r) for r in rows]


@router.get(
    "/admin/notifications/deliveries",
    response_model=NotificationDeliveryListResponse,
)
async def list_admin_deliveries_endpoint(
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "read"),
    __: None = require_any_role(*ORG_NOTIFICATION_MANAGER_ROLE_CODES),
) -> NotificationDeliveryListResponse:
    rows = await list_admin_deliveries_for_viewer(
        db, viewer_user_id=current_user.id, limit=limit
    )
    return NotificationDeliveryListResponse(
        items=[NotificationDeliveryRead.model_validate(r) for r in rows]
    )


@router.delete(
    "/admin/notifications/deliveries",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_all_deliveries_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "update"),
    __: None = require_any_role(*ORG_NOTIFICATION_MANAGER_ROLE_CODES),
) -> None:
    """Delete all notification deliveries (admin only)."""
    deleted = await delete_all_deliveries(db, user_id=None)
    await audit_service.log(
        session=db,
        action="notifications.deliveries.clear_all",
        resource_type="notification_delivery",
        resource_id=None,
        new_value={"deleted_count": deleted},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


@router.post(
    "/admin/notifications/broadcast",
    response_model=NotificationBroadcastResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def broadcast_notification_endpoint(
    body: NotificationBroadcastRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    app_settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "update"),
    __: None = require_any_role(*ORG_NOTIFICATION_MANAGER_ROLE_CODES),
) -> NotificationBroadcastResponse:
    role_codes, branch_ids = _normalize_broadcast_targets(body)
    result = await broadcast_notification(
        db,
        title=body.title,
        body=body.body,
        target_type=body.target_type,
        role_codes=role_codes,
        branch_ids=branch_ids,
        data=body.data,
        default_push_provider=app_settings.PUSH_PROVIDER,
    )
    await audit_service.log(
        session=db,
        action="notifications.broadcast.sent",
        resource_type="notification_broadcast",
        resource_id=None,
        new_value={**body.model_dump(), **result},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return NotificationBroadcastResponse(**result)


@router.post(
    "/admin/notifications/schedules/{schedule_id}/run",
    response_model=ScheduleTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_schedule_endpoint(
    schedule_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    app_settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("notifications", "update"),
    role_codes: frozenset[str] = Depends(get_current_user_role_codes),
) -> ScheduleTriggerResponse:
    sch = await get_schedule(db, schedule_id=schedule_id)
    if is_company_wide_schedule(sch):
        if not (role_codes & ORG_NOTIFICATION_MANAGER_ROLE_CODES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Running company-wide routines requires Owner, Admin, IT Admin, or HR Manager role.",
            )
    run = await run_schedule_once(
        db,
        schedule_id=schedule_id,
        default_push_provider=app_settings.PUSH_PROVIDER,
    )
    # Re-query deliveries for counts after dispatch has finished.
    from sqlalchemy import func, select

    from app.models.notifications import NotificationDelivery, NotificationStatus

    result = await db.execute(
        select(NotificationDelivery.status, func.count())
        .where(NotificationDelivery.run_id == run.id)
        .group_by(NotificationDelivery.status)
    )
    counts = {str(row[0]): int(row[1]) for row in result.all()}
    sent = counts.get(NotificationStatus.SENT.value, 0) + counts.get("sent", 0)
    failed = counts.get(NotificationStatus.FAILED.value, 0) + counts.get("failed", 0)
    await audit_service.log(
        session=db,
        action="notifications.schedule.triggered",
        resource_type="notification_schedule",
        resource_id=str(schedule_id),
        new_value={"run_id": run.id, "deliveries": run.deliveries_enqueued},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ScheduleTriggerResponse(
        schedule_id=schedule_id,
        run_id=run.id,
        deliveries_enqueued=run.deliveries_enqueued,
        deliveries_sent=sent,
        deliveries_failed=failed,
    )
