"""Lightweight schema readiness probes for startup and background loops."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def table_exists(db: AsyncSession, table_name: str, *, schema: str = "public") -> bool:
    """Return True when ``schema.table_name`` exists (PostgreSQL ``to_regclass``)."""
    qualified = f"{schema}.{table_name}"
    result = await db.execute(
        text("SELECT to_regclass(:qualified) IS NOT NULL"),
        {"qualified": qualified},
    )
    return bool(result.scalar())


async def notifications_schema_ready(db: AsyncSession) -> bool:
    """Notification scheduler requires schedules, runs, and deliveries tables."""
    for name in ("notification_schedules", "notification_runs", "notification_deliveries"):
        if not await table_exists(db, name):
            return False
    return True
