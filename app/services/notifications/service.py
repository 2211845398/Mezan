"""Notification dispatch service and scheduler loop (Epic 13).

Public API
----------
- ``register_device_token`` / ``revoke_device_token`` — device token CRUD.
- ``upsert_template`` / ``get_template`` — template CRUD.
- ``upsert_schedule`` / ``list_schedules`` / ``get_schedule`` — schedule CRUD.
- ``run_schedule_once`` — execute a single schedule right now (admin trigger).
- ``run_due_schedules`` — execute every schedule whose interval has elapsed.
- ``notification_scheduler_loop`` — background task to be awaited from the
  FastAPI lifespan, mirroring ``backup_scheduler_loop``.

Design notes
------------
- Generators (see ``app.services.notifications.generators``) produce the *what*
  (recipients and context); this service produces the *how* (template
  rendering, provider send, persistence, retry).
- Deliveries are inserted inside the same DB transaction that ticked the
  schedule, so a crash mid-run cannot lose the audit trail. The provider send
  itself is done **after** commit with a short-lived session to record success
  or failure; this keeps DB locks short and avoids coupling the LLM-style
  external call to a long transaction.
- Idempotency is enforced at the DB level by
  ``uq_notification_deliveries_schedule_idem``; we let Postgres reject
  duplicates and skip them quietly.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import and_, func, not_, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_role_codes
from app.core.config import settings
from app.core.errors import ExternalServiceError, NotFoundError, ValidationError
from app.core.notification_rbac import ORG_NOTIFICATION_MANAGER_ROLE_CODES
from app.db.database import AsyncSessionLocal
from app.models.notifications import (
    DevicePlatform,
    DeviceToken,
    NotificationDelivery,
    NotificationRun,
    NotificationRunStatus,
    NotificationSchedule,
    NotificationStatus,
    NotificationTemplate,
)
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.services.notifications.generators import (
    GeneratedNotification,
    get_generator,
    list_generator_kinds,
)
from app.services.notifications.providers.base import PushProvider
from app.services.notifications.providers.mock import MockPushProvider

logger = logging.getLogger(__name__)


# ── Provider registry ────────────────────────────────────────────────────────


def get_provider(
    provider_name: str | None,
    *,
    default_push_provider: str,
) -> PushProvider:
    """Resolve a push provider.

    ``provider_name`` overrides the application default (typically from
    ``Settings.PUSH_PROVIDER``), which callers pass explicitly so this layer
    stays free of ambient configuration in tests.
    """
    selected = (provider_name or default_push_provider).lower()
    if selected == "mock":
        return MockPushProvider()
    if selected == "fcm":
        from app.services.notifications.providers.fcm import FcmPushProvider

        return FcmPushProvider()
    raise ValidationError("Unsupported push provider", details={"provider": selected})


# ── Device tokens ────────────────────────────────────────────────────────────


async def register_device_token(
    db: AsyncSession,
    *,
    user_id: int,
    platform: str,
    token: str,
    device_label: str | None = None,
    app_version: str | None = None,
) -> DeviceToken:
    """Idempotent device token registration.

    If the exact ``(token)`` already exists, it is re-bound to the caller, its
    label / version are refreshed, ``last_seen_at`` is bumped and any prior
    revocation cleared. Otherwise a new row is inserted.
    """
    try:
        platform_enum = DevicePlatform(platform.lower())
    except ValueError as exc:
        raise ValidationError(
            "Unsupported device platform",
            details={"platform": platform, "allowed": [p.value for p in DevicePlatform]},
        ) from exc

    existing = await db.execute(select(DeviceToken).where(DeviceToken.token == token))
    row = existing.scalar_one_or_none()
    now = datetime.now(UTC)
    if row is not None:
        row.user_id = user_id
        row.platform = platform_enum
        row.device_label = device_label
        row.app_version = app_version
        row.last_seen_at = now
        row.revoked_at = None
        await db.commit()
        await db.refresh(row)
        return row

    entry = DeviceToken(
        user_id=user_id,
        platform=platform_enum,
        token=token,
        device_label=device_label,
        app_version=app_version,
        last_seen_at=now,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def revoke_device_token(db: AsyncSession, *, user_id: int, token_id: int) -> DeviceToken:
    result = await db.execute(
        select(DeviceToken).where(DeviceToken.id == token_id).where(DeviceToken.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise NotFoundError("Device token not found")
    row.revoked_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return row


async def list_device_tokens(db: AsyncSession, *, user_id: int) -> list[DeviceToken]:
    result = await db.execute(
        select(DeviceToken)
        .where(DeviceToken.user_id == user_id)
        .where(DeviceToken.revoked_at.is_(None))
        .order_by(DeviceToken.last_seen_at.desc())
    )
    return list(result.scalars().all())


# ── Template & schedule CRUD ─────────────────────────────────────────────────


async def upsert_template(
    db: AsyncSession,
    *,
    kind: str,
    title_template: str,
    body_template: str,
    default_data: dict,
    is_active: bool,
) -> NotificationTemplate:
    result = await db.execute(select(NotificationTemplate).where(NotificationTemplate.kind == kind))
    row = result.scalar_one_or_none()
    if row is None:
        row = NotificationTemplate(
            kind=kind,
            title_template=title_template,
            body_template=body_template,
            default_data=default_data or {},
            is_active=is_active,
        )
        db.add(row)
    else:
        row.title_template = title_template
        row.body_template = body_template
        row.default_data = default_data or {}
        row.is_active = is_active
    await db.commit()
    await db.refresh(row)
    return row


async def get_template(db: AsyncSession, *, kind: str) -> NotificationTemplate | None:
    result = await db.execute(select(NotificationTemplate).where(NotificationTemplate.kind == kind))
    return result.scalar_one_or_none()


async def list_templates(db: AsyncSession) -> list[NotificationTemplate]:
    result = await db.execute(
        select(NotificationTemplate).order_by(NotificationTemplate.kind.asc())
    )
    return list(result.scalars().all())


async def upsert_schedule(
    db: AsyncSession,
    *,
    name: str,
    kind: str,
    interval_minutes: int,
    target_role_code: str | None,
    branch_id: int | None,
    parameters: dict,
    is_active: bool,
) -> NotificationSchedule:
    if get_generator(kind) is None:
        raise ValidationError(
            "Unknown notification kind",
            details={"kind": kind, "available": list_generator_kinds()},
        )

    result = await db.execute(select(NotificationSchedule).where(NotificationSchedule.name == name))
    row = result.scalar_one_or_none()
    if row is None:
        row = NotificationSchedule(
            name=name,
            kind=kind,
            interval_minutes=interval_minutes,
            target_role_code=target_role_code,
            branch_id=branch_id,
            parameters=parameters or {},
            is_active=is_active,
        )
        db.add(row)
    else:
        row.kind = kind
        row.interval_minutes = interval_minutes
        row.target_role_code = target_role_code
        row.branch_id = branch_id
        row.parameters = parameters or {}
        row.is_active = is_active
    await db.commit()
    await db.refresh(row)
    return row


async def get_schedule(db: AsyncSession, *, schedule_id: int) -> NotificationSchedule:
    result = await db.execute(
        select(NotificationSchedule).where(NotificationSchedule.id == schedule_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise NotFoundError("Schedule not found")
    return row


async def list_schedules(
    db: AsyncSession, *, viewer_user_id: int | None = None
) -> list[NotificationSchedule]:
    """List schedules; non–org-managers do not see company-wide (all users, all branches) rows."""
    stmt = select(NotificationSchedule).order_by(NotificationSchedule.id.asc())
    if viewer_user_id is not None:
        codes = await get_user_role_codes(db, viewer_user_id)
        if not (codes & ORG_NOTIFICATION_MANAGER_ROLE_CODES):
            stmt = stmt.where(
                not_(
                    and_(
                        NotificationSchedule.target_role_code.is_(None),
                        NotificationSchedule.branch_id.is_(None),
                    )
                )
            )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def delete_schedule(db: AsyncSession, *, schedule_id: int) -> dict[str, str | int]:
    """Remove a notification schedule (runs cascade; deliveries FK may SET NULL).

    Caller must ``commit`` the session (after audit logging, if any).
    """
    row = await get_schedule(db, schedule_id=schedule_id)
    snapshot = {"id": row.id, "name": row.name, "kind": row.kind}
    await db.delete(row)
    return snapshot


async def list_notification_runs(db: AsyncSession, *, limit: int = 200) -> list[NotificationRun]:
    """Return recent runs (newest first) for admin audit UI."""
    result = await db.execute(
        select(NotificationRun)
        .order_by(NotificationRun.started_at.desc())
        .limit(max(1, min(limit, 500)))
    )
    return list(result.scalars().all())


async def list_recent_deliveries(
    db: AsyncSession, *, user_id: int | None, limit: int, unread_only: bool = False
) -> list[NotificationDelivery]:
    stmt = select(NotificationDelivery).order_by(NotificationDelivery.id.desc()).limit(limit)
    if user_id is not None:
        stmt = stmt.where(NotificationDelivery.user_id == user_id)
    if unread_only:
        stmt = stmt.where(NotificationDelivery.read_at.is_(None))
    result = await db.execute(stmt)
    return list(result.scalars().all())


# Per-user 2nd-person notifications: org admin history should not surface other
# users' copies (avoids "your leave" rows that are not the viewer's).
_ADMIN_HISTORY_PERSONAL_KINDS: tuple[str, ...] = (
    "leave_request_review",
    "leave_request_submitted",
    "payslip_paid",
)


async def list_admin_deliveries_for_viewer(
    db: AsyncSession, *, viewer_user_id: int, limit: int
) -> list[NotificationDelivery]:
    kinds = _ADMIN_HISTORY_PERSONAL_KINDS
    stmt = (
        select(NotificationDelivery)
        .where(
            or_(
                not_(NotificationDelivery.template_kind.in_(kinds)),
                NotificationDelivery.user_id == viewer_user_id,
            )
        )
        .order_by(NotificationDelivery.id.desc())
        .limit(max(1, min(limit, 500)))
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_unread_deliveries(db: AsyncSession, *, user_id: int) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(NotificationDelivery)
        .where(NotificationDelivery.user_id == user_id)
        .where(NotificationDelivery.read_at.is_(None))
    )
    return int(result.scalar_one())


async def mark_delivery_read(
    db: AsyncSession, *, user_id: int, delivery_id: int
) -> NotificationDelivery:
    result = await db.execute(
        select(NotificationDelivery)
        .where(NotificationDelivery.id == delivery_id)
        .where(NotificationDelivery.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise NotFoundError("Notification delivery not found")
    if row.read_at is None:
        row.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(row)
    return row


async def mark_all_deliveries_read(db: AsyncSession, *, user_id: int) -> int:
    now = datetime.now(UTC)
    result = await db.execute(
        update(NotificationDelivery)
        .where(NotificationDelivery.user_id == user_id)
        .where(NotificationDelivery.read_at.is_(None))
        .values(read_at=now)
    )
    await db.commit()
    return int(result.rowcount or 0)


async def delete_read_deliveries(db: AsyncSession, *, user_id: int) -> int:
    """Delete all read deliveries for a user. Returns the number of rows deleted."""
    from sqlalchemy import delete

    result = await db.execute(
        delete(NotificationDelivery)
        .where(NotificationDelivery.user_id == user_id)
        .where(NotificationDelivery.read_at.isnot(None))
    )
    await db.commit()
    return int(result.rowcount or 0)


async def delete_all_deliveries(db: AsyncSession, *, user_id: int | None = None) -> int:
    """Delete all deliveries. If user_id is provided, only delete for that user.
    Returns the number of rows deleted."""
    from sqlalchemy import delete

    stmt = delete(NotificationDelivery)
    if user_id is not None:
        stmt = stmt.where(NotificationDelivery.user_id == user_id)
    result = await db.execute(stmt)
    await db.commit()
    return int(result.rowcount or 0)


# ── Rendering ────────────────────────────────────────────────────────────────


def _safe_format(template_str: str, context: dict) -> str:
    """Format with ``str.format``, swallowing missing keys so one bad payload
    does not blow up the whole run."""
    try:
        return template_str.format(**context)
    except (KeyError, IndexError, ValueError) as exc:
        logger.warning("notification_template_format_failed", exc_info=exc)
        return template_str


# ── Core execution ───────────────────────────────────────────────────────────


async def _enqueue_deliveries_for_schedule(
    db: AsyncSession,
    *,
    schedule: NotificationSchedule,
    run: NotificationRun,
    template: NotificationTemplate,
    batch: list[GeneratedNotification],
    provider_name: str,
) -> list[NotificationDelivery]:
    """Insert pending deliveries, honoring idempotency uniqueness.

    Rows that collide with an existing ``(schedule_id, idempotency_key)`` are
    silently dropped; this is the core anti-spam guarantee.
    """
    created: list[NotificationDelivery] = []
    for gen in batch:
        data = {**template.default_data, **(gen.data_override or {}), **gen.context}
        title = gen.title_override or _safe_format(template.title_template, data)
        body = gen.body_override or _safe_format(template.body_template, data)
        for user_id in gen.user_ids:
            row = NotificationDelivery(
                schedule_id=schedule.id,
                run_id=run.id,
                user_id=user_id,
                template_kind=template.kind,
                idempotency_key=gen.idempotency_key,
                title=title,
                body=body,
                data=data,
                status=NotificationStatus.PENDING,
                provider=provider_name,
            )
            try:
                async with db.begin_nested():
                    db.add(row)
                    await db.flush()
            except IntegrityError:
                # Duplicate (schedule_id, idempotency_key): another tick already
                # enqueued this exact alert. Skip without rolling back the outer txn.
                continue
            created.append(row)
    return created


async def _dispatch_delivery(
    db: AsyncSession,
    *,
    delivery: NotificationDelivery,
    provider: PushProvider,
) -> None:
    """Send one pending delivery.

    Rules:
    - If the user has no active device token, mark ``skipped`` (not failed).
    - Otherwise try each active token; mark ``sent`` on first success.
    - Any token reported invalid by the provider is revoked immediately.
    """
    tokens_result = await db.execute(
        select(DeviceToken)
        .where(DeviceToken.user_id == delivery.user_id)
        .where(DeviceToken.revoked_at.is_(None))
    )
    tokens = list(tokens_result.scalars().all())
    if not tokens:
        delivery.status = NotificationStatus.SKIPPED
        delivery.error_code = "no_device_token"
        delivery.error_message = "User has no active device token"
        await db.commit()
        return

    last_error_code = None
    last_error_message = None
    for token_row in tokens:
        try:
            result = await provider.send(
                token=token_row.token,
                title=delivery.title,
                body=delivery.body,
                data=delivery.data,
            )
        except ExternalServiceError as exc:
            last_error_code = exc.code
            last_error_message = exc.message[:500]
            continue
        if result.token_invalid:
            token_row.revoked_at = datetime.now(UTC)
        if result.success:
            delivery.status = NotificationStatus.SENT
            delivery.provider_message_id = result.message_id
            delivery.sent_at = datetime.now(UTC)
            delivery.device_token_id = token_row.id
            await db.commit()
            return
        last_error_code = result.error_code
        last_error_message = result.error_message

    delivery.status = NotificationStatus.FAILED
    delivery.error_code = last_error_code or "send_failed"
    delivery.error_message = (last_error_message or "All tokens failed")[:500]
    await db.commit()


async def _resolve_broadcast_recipients(
    db: AsyncSession,
    *,
    target_type: str,
    role_codes: list[str],
    branch_ids: list[int],
) -> list[int]:
    """Resolve active users for a manual admin broadcast.

    ``branch_ids`` empty means all branches. ``role_codes`` must be non-empty
    when ``target_type`` is ``role`` (union of users holding any listed role).
    """
    stmt = select(User.id).where(User.status == "active")
    if branch_ids:
        stmt = stmt.where(User.branch_id.in_(branch_ids))

    if target_type == "role":
        codes = [c.strip() for c in role_codes if c and str(c).strip()]
        if not codes:
            raise ValidationError(
                "role_codes must be non-empty when target_type is role",
                details={"role_codes": role_codes},
            )
        stmt = (
            stmt.join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.code.in_(codes))
        )
        if branch_ids:
            stmt = stmt.where(or_(UserRole.branch_id.is_(None), UserRole.branch_id.in_(branch_ids)))
    elif target_type != "all":
        raise ValidationError(
            "Unsupported notification target",
            details={"target_type": target_type, "allowed": ["all", "role"]},
        )

    result = await db.execute(stmt.distinct().order_by(User.id.asc()))
    return [row[0] for row in result.all()]


async def _delivery_status_counts(
    db: AsyncSession, *, delivery_ids: list[int]
) -> dict[NotificationStatus | str, int]:
    if not delivery_ids:
        return {}
    result = await db.execute(
        select(NotificationDelivery.status, func.count())
        .where(NotificationDelivery.id.in_(delivery_ids))
        .group_by(NotificationDelivery.status)
    )
    return {row[0]: int(row[1]) for row in result.all()}


async def enqueue_direct_notification(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    body: str,
    template_kind: str,
    idempotency_key: str,
    data: dict | None,
    provider_name: str | None,
    default_push_provider: str,
) -> int | None:
    """Insert a single in-app/push delivery row. Returns delivery id or None on duplicate."""
    provider = get_provider(provider_name, default_push_provider=default_push_provider)
    row = NotificationDelivery(
        schedule_id=None,
        run_id=None,
        user_id=user_id,
        template_kind=template_kind,
        idempotency_key=idempotency_key,
        title=title,
        body=body,
        data=data or {},
        status=NotificationStatus.PENDING,
        provider=provider.name,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        return None
    return row.id


async def dispatch_delivery_after_commit(
    delivery_id: int, *, default_push_provider: str, provider_name: str | None = None
) -> None:
    """Dispatch using a fresh session (call after the inserting transaction commits)."""
    provider = get_provider(provider_name, default_push_provider=default_push_provider)
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(NotificationDelivery).where(NotificationDelivery.id == delivery_id)
        )
        delivery_row = res.scalar_one_or_none()
        if delivery_row is None:
            return
        await _dispatch_delivery(db, delivery=delivery_row, provider=provider)


async def broadcast_notification(
    db: AsyncSession,
    *,
    title: str,
    body: str,
    target_type: str,
    role_codes: list[str],
    branch_ids: list[int],
    data: dict,
    provider_name: str | None = None,
    default_push_provider: str,
) -> dict[str, int]:
    """Create in-app notifications for a simple admin broadcast and try push delivery."""
    recipients = await _resolve_broadcast_recipients(
        db,
        target_type=target_type,
        role_codes=role_codes,
        branch_ids=branch_ids,
    )
    provider = get_provider(provider_name, default_push_provider=default_push_provider)
    batch_key = f"manual:{uuid4().hex}"
    created: list[NotificationDelivery] = []
    now_iso = datetime.now(UTC).isoformat()

    for user_id in recipients:
        row = NotificationDelivery(
            schedule_id=None,
            run_id=None,
            user_id=user_id,
            template_kind="manual",
            idempotency_key=f"{batch_key}:{user_id}",
            title=title,
            body=body,
            data={
                **(data or {}),
                "target_type": target_type,
                "role_codes": role_codes,
                "branch_ids": branch_ids,
                "broadcasted_at": now_iso,
            },
            status=NotificationStatus.PENDING,
            provider=provider.name,
        )
        db.add(row)
        await db.flush()
        created.append(row)

    await db.commit()

    delivery_ids = [row.id for row in created]
    for delivery_id in delivery_ids:
        async with AsyncSessionLocal() as dispatch_db:
            reloaded = await dispatch_db.execute(
                select(NotificationDelivery).where(NotificationDelivery.id == delivery_id)
            )
            delivery_row = reloaded.scalar_one_or_none()
            if delivery_row is None:
                continue
            await _dispatch_delivery(dispatch_db, delivery=delivery_row, provider=provider)

    counts = await _delivery_status_counts(db, delivery_ids=delivery_ids)
    sent = counts.get(NotificationStatus.SENT, 0) + counts.get(NotificationStatus.SENT.value, 0)
    failed = counts.get(NotificationStatus.FAILED, 0) + counts.get(
        NotificationStatus.FAILED.value, 0
    )
    skipped = counts.get(NotificationStatus.SKIPPED, 0) + counts.get(
        NotificationStatus.SKIPPED.value, 0
    )
    return {
        "deliveries_created": len(delivery_ids),
        "deliveries_sent": sent,
        "deliveries_failed": failed,
        "deliveries_skipped": skipped,
    }


async def run_schedule_once(
    db: AsyncSession,
    *,
    schedule_id: int,
    provider_name: str | None = None,
    default_push_provider: str,
) -> NotificationRun:
    """Execute a single schedule right now (admin trigger or scheduler tick)."""
    schedule = await get_schedule(db, schedule_id=schedule_id)
    if not schedule.is_active:
        raise ValidationError("Schedule is not active", details={"schedule_id": schedule_id})

    generator = get_generator(schedule.kind)
    if generator is None:
        raise ValidationError(
            "No generator registered for kind",
            details={"kind": schedule.kind, "available": list_generator_kinds()},
        )

    template = await get_template(db, kind=schedule.kind)
    if template is None and schedule.kind == "manual_broadcast":
        template = NotificationTemplate(
            kind="manual_broadcast",
            title_template="{title}",
            body_template="{body}",
            default_data={},
            is_active=True,
        )
    if template is None or not template.is_active:
        raise ValidationError(
            "No active template for kind",
            details={"kind": schedule.kind},
        )

    # Snapshot scalars before any nested flush/rollback path so we never rely on
    # lazy loads after a savepoint rollback (async MissingGreenlet).
    interval_minutes = schedule.interval_minutes

    provider = get_provider(provider_name, default_push_provider=default_push_provider)

    run = NotificationRun(
        schedule_id=schedule.id,
        status=NotificationRunStatus.STARTED,
    )
    db.add(run)
    await db.flush()

    params = {**(schedule.parameters or {})}
    if schedule.branch_id is not None:
        params.setdefault("branch_id", schedule.branch_id)
    if schedule.target_role_code is not None:
        params.setdefault("target_role_code", schedule.target_role_code)

    try:
        batch = await generator(db, params)
    except Exception as exc:  # noqa: BLE001 — we want to record any failure mode
        run.status = NotificationRunStatus.FAILED
        run.finished_at = datetime.now(UTC)
        run.error_message = str(exc)[:500]
        await db.commit()
        logger.exception("notification_generator_failed", extra={"kind": schedule.kind})
        return run

    deliveries = await _enqueue_deliveries_for_schedule(
        db,
        schedule=schedule,
        run=run,
        template=template,
        batch=batch,
        provider_name=provider.name,
    )

    run.deliveries_enqueued = len(deliveries)
    last_run_at = datetime.now(UTC)
    schedule.last_run_at = last_run_at
    schedule.next_run_at = last_run_at + timedelta(minutes=interval_minutes)
    run.status = NotificationRunStatus.COMPLETED
    run.finished_at = datetime.now(UTC)
    await db.commit()

    # Phase 2: dispatch outside the scheduling transaction. A fresh session per
    # delivery keeps locks short and isolates provider failures.
    delivery_ids = [d.id for d in deliveries]
    for delivery_id in delivery_ids:
        async with AsyncSessionLocal() as dispatch_db:
            reloaded = await dispatch_db.execute(
                select(NotificationDelivery).where(NotificationDelivery.id == delivery_id)
            )
            delivery_row = reloaded.scalar_one_or_none()
            if delivery_row is None:
                continue
            await _dispatch_delivery(dispatch_db, delivery=delivery_row, provider=provider)

    await db.refresh(run)
    return run


async def run_due_schedules(db: AsyncSession) -> list[NotificationRun]:
    """Execute every active schedule whose ``next_run_at`` is due (or null).

    Returns one ``NotificationRun`` per executed schedule.
    """
    now = datetime.now(UTC)
    result = await db.execute(
        select(NotificationSchedule)
        .where(NotificationSchedule.is_active.is_(True))
        .order_by(NotificationSchedule.id.asc())
    )
    schedules = list(result.scalars().all())
    runs: list[NotificationRun] = []
    for sched in schedules:
        due = sched.next_run_at is None or sched.next_run_at <= now
        if not due:
            continue
        try:
            run = await run_schedule_once(
                db,
                schedule_id=sched.id,
                default_push_provider=settings.PUSH_PROVIDER,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "notification_schedule_run_failed",
                extra={"schedule_id": sched.id, "kind": sched.kind, "error": str(exc)},
            )
            continue
        runs.append(run)
    return runs


# ── Scheduler loop (mirrors backup_scheduler_loop) ───────────────────────────


async def notification_scheduler_loop(stop_event: asyncio.Event) -> None:
    """Background tick loop awaited from the FastAPI lifespan.

    Ticks every ``NOTIFICATIONS_TICK_SECONDS`` (default 60s). Skips execution
    when the subsystem is disabled. Each tick uses its own DB session so a
    long-lived open transaction cannot leak across ticks.
    """
    interval_seconds = max(settings.NOTIFICATIONS_TICK_SECONDS, 10)
    while not stop_event.is_set():
        if settings.NOTIFICATIONS_ENABLED:
            try:
                async with AsyncSessionLocal() as db:
                    await run_due_schedules(db)
            except Exception:  # noqa: BLE001 — loop must never die silently
                logger.exception("notification_scheduler_tick_failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except TimeoutError:
            continue
