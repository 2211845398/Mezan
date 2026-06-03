"""Garbage-collect stale temporary CRM customers (Epic CRM hygiene).

Deletes ``CustomerProfile`` rows that are temporary, older than a retention window,
and have no blocking references (loyalty ledger, invoices, open AR, active POS carts).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, exists, not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import AsyncSessionLocal
from app.models.ar_open_item import ArOpenItem
from app.models.customer_profile import CustomerProfile
from app.models.loyalty import LoyaltyLedger
from app.models.pos_cart import PosCart
from app.models.sales_invoice import SalesInvoice
from app.services import audit_service

logger = logging.getLogger(__name__)

_last_gc_run_calendar_day: date | None = None


def _eligible_customer_ids_stmt(*, cutoff: datetime):
    """Customers that pass static eligibility filters (ORM-level)."""
    loyalty_exists = exists().where(LoyaltyLedger.customer_id == CustomerProfile.id)
    invoice_exists = exists().where(SalesInvoice.customer_id == CustomerProfile.id)
    ar_open_exists = exists().where(
        and_(
            ArOpenItem.customer_id == CustomerProfile.id,
            ArOpenItem.amount_open > 0,
            ArOpenItem.status.in_(("open", "partial")),
        )
    )
    active_cart_exists = exists().where(
        and_(
            PosCart.customer_id == CustomerProfile.id,
            PosCart.status.in_(("active", "parked", "checkout_locked")),
        )
    )
    return (
        select(CustomerProfile.id)
        .where(
            CustomerProfile.is_temporary.is_(True),
            CustomerProfile.created_at < cutoff,
            not_(loyalty_exists),
            not_(invoice_exists),
            not_(ar_open_exists),
            not_(active_cart_exists),
        )
        .order_by(CustomerProfile.id.asc())
    )


async def run_customer_gc_once(db: AsyncSession, *, now: datetime | None = None) -> list[int]:
    """Run one GC pass: delete all eligible temporary customers. Returns deleted ids."""
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(days=settings.CUSTOMER_GC_RETENTION_DAYS)
    stmt = _eligible_customer_ids_stmt(cutoff=cutoff)
    res = await db.execute(stmt)
    ids = [int(row[0]) for row in res.all()]
    deleted: list[int] = []
    for cid in ids:
        row = await db.get(CustomerProfile, cid)
        if not row:
            continue
        if not row.is_temporary:
            continue
        await db.delete(row)
        deleted.append(cid)
    if deleted:
        await audit_service.log(
            session=db,
            action="customer.gc_deleted_batch",
            resource_type="customer_profile",
            resource_id=",".join(str(x) for x in deleted[:50]),
            new_value={
                "deleted_customer_ids": deleted,
                "count": len(deleted),
                "retention_days": settings.CUSTOMER_GC_RETENTION_DAYS,
            },
            user_id=None,
        )
    await db.commit()
    return deleted


async def run_customer_gc_daily_if_due(db: AsyncSession, *, now: datetime | None = None) -> None:
    """At most once per UTC calendar day while the process is alive."""
    global _last_gc_run_calendar_day
    now = now or datetime.now(UTC)
    today = now.date()
    if _last_gc_run_calendar_day == today:
        return
    deleted = await run_customer_gc_once(db, now=now)
    _last_gc_run_calendar_day = today
    if deleted:
        logger.info(
            "customer_gc_completed",
            extra={"count": len(deleted), "sample_ids": deleted[:20]},
        )


async def customer_gc_scheduler_loop(stop_event: asyncio.Event) -> None:
    """Background loop: checks periodically and runs GC at most once per UTC day."""
    tick = max(settings.CUSTOMER_GC_TICK_SECONDS, 60)
    while not stop_event.is_set():
        if settings.CUSTOMER_GC_ENABLED:
            try:
                async with AsyncSessionLocal() as db:
                    await run_customer_gc_daily_if_due(db)
            except Exception:  # noqa: BLE001
                logger.exception("customer_gc_tick_failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=tick)
        except TimeoutError:
            continue
