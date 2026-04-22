"""Notification API (Epic 13).

Three audiences:
- Authenticated end users register and revoke their own device tokens and read
  their own delivery history.
- Admins manage templates and schedules, and can trigger a run on demand.
- No one writes to deliveries directly through this API; deliveries are emitted
  by the scheduler or by a manual run.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.notifications import (
    DeviceTokenListResponse,
    DeviceTokenRead,
    DeviceTokenRegisterRequest,
    NotificationDeliveryListResponse,
    NotificationDeliveryRead,
    NotificationRunRead,
    NotificationScheduleListResponse,
    NotificationScheduleRead,
    NotificationScheduleUpsert,
    NotificationTemplateRead,
    NotificationTemplateUpsert,
    ScheduleTriggerResponse,
)
from app.services import audit_service
from app.services.notifications.service import (
    list_device_tokens,
    list_notification_runs,
    list_recent_deliveries,
    list_schedules,
    list_templates,
    register_device_token,
    revoke_device_token,
    run_schedule_once,
    upsert_schedule,
    upsert_template,
)

router = APIRouter()


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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationDeliveryListResponse:
    rows = await list_recent_deliveries(db, user_id=current_user.id, limit=limit)
    return NotificationDeliveryListResponse(
        items=[NotificationDeliveryRead.model_validate(r) for r in rows]
    )


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
    _: None = require_permission("config", "update"),
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
    __: None = require_permission("config", "read"),
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
    _: None = require_permission("config", "update"),
) -> NotificationScheduleRead:
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
    _: None = Depends(get_current_user),
    __: None = require_permission("config", "read"),
) -> NotificationScheduleListResponse:
    rows = await list_schedules(db)
    return NotificationScheduleListResponse(
        items=[NotificationScheduleRead.model_validate(r) for r in rows]
    )


@router.get(
    "/admin/notifications/runs",
    response_model=list[NotificationRunRead],
)
async def list_notification_runs_endpoint(
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("config", "read"),
) -> list[NotificationRunRead]:
    rows = await list_notification_runs(db, limit=limit)
    return [NotificationRunRead.model_validate(r) for r in rows]


@router.post(
    "/admin/notifications/schedules/{schedule_id}/run",
    response_model=ScheduleTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_schedule_endpoint(
    schedule_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("config", "update"),
) -> ScheduleTriggerResponse:
    run = await run_schedule_once(db, schedule_id=schedule_id)
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
