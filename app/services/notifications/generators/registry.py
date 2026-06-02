"""Built-in notification generators.

All queries here are read-only and deterministic: the same database state plus
the same parameters yield the same generated list. This keeps idempotency keys
stable and makes the "have we already notified about this?" guard in
``NotificationDelivery`` effective.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payslip import Payslip, PayslipStatus
from app.models.pos_shift import PosShift
from app.models.product import Product
from app.models.role import Role
from app.models.stock_level import StockLevel
from app.models.user_role import UserRole
from app.models.users import User
from app.services.notifications.generators.base import (
    GeneratedNotification,
    register_generator,
)


async def _resolve_recipients_by_role_codes(
    db: AsyncSession,
    *,
    role_codes: list[str],
    branch_id: int | None = None,
) -> list[int]:
    """Union of active users who hold any of the given role codes (strict routing)."""
    if not role_codes:
        return []
    stmt = (
        select(User.id)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code.in_(role_codes))
        .where(User.status == "active")
    )
    if branch_id is not None:
        stmt = stmt.where(User.branch_id == branch_id).where(
            or_(UserRole.branch_id.is_(None), UserRole.branch_id == branch_id)
        )
    result = await db.execute(stmt.distinct())
    return [row[0] for row in result.all()]


@register_generator("manual_broadcast")
async def generate_manual_broadcast(
    db: AsyncSession, params: dict[str, Any]
) -> list[GeneratedNotification]:
    """Recurring plain-message notification configured by admins."""
    title = str(params.get("title") or "").strip()
    body = str(params.get("body") or "").strip()
    if not title or not body:
        return []

    raw_user_ids = params.get("target_user_ids")
    if raw_user_ids:
        user_ids = [int(uid) for uid in raw_user_ids if uid is not None]
        if not user_ids:
            return []
        window = datetime.now(UTC).strftime("%Y%m%d%H%M")
        return [
            GeneratedNotification(
                user_ids=user_ids,
                idempotency_key=f"manual_broadcast:{window}:users:{','.join(str(u) for u in sorted(user_ids))}",
                context={
                    "title": title,
                    "body": body,
                    "target_user_ids": user_ids,
                },
                title_override=title,
                body_override=body,
                data_override={"source": "routine_manual_broadcast"},
            )
        ]

    branch_id = params.get("branch_id")
    target_role_code = params.get("target_role_code")
    stmt = select(User.id).where(User.status == "active")
    if branch_id is not None:
        stmt = stmt.where(User.branch_id == int(branch_id))
    if target_role_code:
        stmt = (
            stmt.join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.code == str(target_role_code))
        )
        if branch_id is not None:
            stmt = stmt.where(
                or_(UserRole.branch_id.is_(None), UserRole.branch_id == int(branch_id))
            )

    result = await db.execute(stmt.distinct())
    recipients = [row[0] for row in result.all()]
    if not recipients:
        return []

    window = datetime.now(UTC).strftime("%Y%m%d%H%M")
    return [
        GeneratedNotification(
            user_ids=recipients,
            idempotency_key=f"manual_broadcast:{window}:{target_role_code or 'all'}:{branch_id or 'all'}",
            context={
                "title": title,
                "body": body,
                "target_role_code": target_role_code,
                "branch_id": branch_id,
            },
            title_override=title,
            body_override=body,
            data_override={"source": "routine_manual_broadcast"},
        )
    ]


# ── low_stock ─────────────────────────────────────────────────────────────────


@register_generator("low_stock")
async def generate_low_stock(
    db: AsyncSession, params: dict[str, Any]
) -> list[GeneratedNotification]:
    """One alert per (product, branch) pair whose on-hand <= threshold.

    Parameters
    ----------
    threshold_qty:
        Integer qty at or below which the product is considered low. Default 5.
    branch_id:
        Optional filter to a single branch (stock rows and recipient users scoped
        to that branch when set).
    Recipients are always ``WAREHOUSE_MANAGER`` and ``FLOOR_STAFF`` (union).
    """
    threshold = int(params.get("threshold_qty", 5))
    branch_id = params.get("branch_id")

    stmt = (
        select(StockLevel.product_id, StockLevel.branch_id, StockLevel.on_hand, Product.name)
        .join(Product, Product.id == StockLevel.product_id)
        .where(StockLevel.on_hand <= threshold)
        .where(Product.status == "active")
    )
    if branch_id is not None:
        stmt = stmt.where(StockLevel.branch_id == int(branch_id))
    result = await db.execute(stmt)
    rows = result.all()
    if not rows:
        return []

    recipients = await _resolve_recipients_by_role_codes(
        db,
        role_codes=["WAREHOUSE_MANAGER", "FLOOR_STAFF"],
        branch_id=int(branch_id) if branch_id is not None else None,
    )
    if not recipients:
        return []

    today_iso = date.today().isoformat()
    out: list[GeneratedNotification] = []
    for product_id, branch_id_row, on_hand, product_name in rows:
        out.append(
            GeneratedNotification(
                user_ids=list(recipients),
                idempotency_key=f"low_stock:{product_id}:{branch_id_row}:{today_iso}",
                context={
                    "product_id": product_id,
                    "product_name": product_name,
                    "branch_id": branch_id_row,
                    "on_hand": int(on_hand),
                    "threshold": threshold,
                },
            )
        )
    return out


# ── expiring_inventory ────────────────────────────────────────────────────────


@register_generator("expiring_inventory")
async def generate_expiring_inventory(
    db: AsyncSession, params: dict[str, Any]
) -> list[GeneratedNotification]:
    """One alert per (product, branch) whose stock will expire within N days.

    Recipients are ``WAREHOUSE_MANAGER`` and ``FLOOR_STAFF`` (union), optionally
    scoped by ``branch_id`` for user assignment.
    """
    days_ahead = int(params.get("days_ahead", 30))
    branch_id = params.get("branch_id")

    cutoff = date.today() + timedelta(days=days_ahead)
    stmt = (
        select(
            StockLevel.product_id,
            StockLevel.branch_id,
            StockLevel.on_hand,
            StockLevel.expiry_date,
            Product.name,
        )
        .join(Product, Product.id == StockLevel.product_id)
        .where(StockLevel.expiry_date.isnot(None))
        .where(StockLevel.expiry_date <= cutoff)
        .where(StockLevel.on_hand > 0)
        .order_by(StockLevel.expiry_date.asc())
    )
    if branch_id is not None:
        stmt = stmt.where(StockLevel.branch_id == int(branch_id))
    result = await db.execute(stmt)
    rows = result.all()
    if not rows:
        return []

    recipients = await _resolve_recipients_by_role_codes(
        db,
        role_codes=["WAREHOUSE_MANAGER", "FLOOR_STAFF"],
        branch_id=int(branch_id) if branch_id is not None else None,
    )
    if not recipients:
        return []

    out: list[GeneratedNotification] = []
    for product_id, branch_id_row, on_hand, expiry_date, product_name in rows:
        days_left = (expiry_date - date.today()).days if expiry_date else None
        out.append(
            GeneratedNotification(
                user_ids=list(recipients),
                idempotency_key=(
                    f"expiring:{product_id}:{branch_id_row}:"
                    f"{expiry_date.isoformat() if expiry_date else 'none'}"
                ),
                context={
                    "product_id": product_id,
                    "product_name": product_name,
                    "branch_id": branch_id_row,
                    "on_hand": int(on_hand),
                    "expiry_date": expiry_date.isoformat() if expiry_date else "",
                    "days_left": days_left if days_left is not None else 0,
                },
            )
        )
    return out


# ── payroll_approval_pending ──────────────────────────────────────────────────


@register_generator("payroll_approval_pending")
async def generate_payroll_approval_pending(
    db: AsyncSession, params: dict[str, Any]
) -> list[GeneratedNotification]:
    """Aggregate alert: there are N draft payslips awaiting approval."""
    stmt = select(Payslip.id).where(Payslip.status == PayslipStatus.DRAFT)
    result = await db.execute(stmt)
    draft_ids = [row[0] for row in result.all()]
    if not draft_ids:
        return []

    recipients = await _resolve_recipients_by_role_codes(
        db,
        role_codes=["HR_MANAGER", "ACCOUNTANT", "OWNER"],
        branch_id=None,
    )
    if not recipients:
        return []

    today_iso = date.today().isoformat()
    return [
        GeneratedNotification(
            user_ids=recipients,
            idempotency_key=f"payroll_pending:{today_iso}:{len(draft_ids)}",
            context={"pending_count": len(draft_ids), "as_of": today_iso},
        )
    ]


# ── shift_close_reminder ──────────────────────────────────────────────────────


@register_generator("shift_close_reminder")
async def generate_shift_close_reminder(
    db: AsyncSession, params: dict[str, Any]
) -> list[GeneratedNotification]:
    """One reminder per shift open longer than ``max_hours`` hours.

    The reminder is sent directly to the cashier who owns the shift, not to a
    role; this is one of the rare generators that targets specific users.
    """
    max_hours = int(params.get("max_hours", 10))
    cutoff = datetime.now(UTC) - timedelta(hours=max_hours)
    stmt = select(PosShift).where(PosShift.status == "open").where(PosShift.opened_at <= cutoff)
    result = await db.execute(stmt)
    shifts = result.scalars().all()
    if not shifts:
        return []

    out: list[GeneratedNotification] = []
    for shift in shifts:
        if shift.opened_by_user_id is None:
            continue
        out.append(
            GeneratedNotification(
                user_ids=[shift.opened_by_user_id],
                idempotency_key=f"shift_close:{shift.id}:{shift.opened_at.date().isoformat()}",
                context={
                    "shift_id": shift.id,
                    "branch_id": shift.branch_id,
                    "opened_at": shift.opened_at.isoformat(),
                    "max_hours": max_hours,
                },
            )
        )
    return out


# ── backup_failure ────────────────────────────────────────────────────────────


@register_generator("backup_failure")
async def generate_backup_failure(
    db: AsyncSession, params: dict[str, Any]
) -> list[GeneratedNotification]:
    """Fires when the last backup run failed.

    Reads the persisted status file from ``backup_service`` and emits a single
    notification keyed by the run's ``started_at`` so retries on the scheduler
    loop never duplicate it.
    """
    from app.services.backup_service import read_backup_status

    status = read_backup_status()
    if status.get("success"):
        return []
    started_at = status.get("started_at") or "unknown"
    message = status.get("message") or "Backup failed"

    recipients = await _resolve_recipients_by_role_codes(
        db,
        role_codes=["IT_ADMIN", "ADMIN"],
        branch_id=None,
    )
    if not recipients:
        return []

    return [
        GeneratedNotification(
            user_ids=recipients,
            idempotency_key=f"backup_failure:{started_at}",
            context={"started_at": started_at, "error_message": message[:240]},
        )
    ]
