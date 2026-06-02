"""Production-safe core database seed (permissions, CoA, settings, optional admin).

Invoked automatically after migrations (Docker entrypoint) and optionally on API
startup when ``SEED_ON_STARTUP`` is enabled. Manual:

    uv run python -m app.scripts.core_seed
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import AsyncSessionLocal, close_db
from app.models.unit_of_measure import UnitOfMeasure
from app.services.seed_service import (
    seed_accounting_defaults,
    seed_default_admin,
    seed_notification_templates,
    seed_permissions_and_roles,
)

logger = logging.getLogger(__name__)

# Keep in sync with alembic o8p9q0r1s2t3 / catalog default (PIECE).
_DEFAULT_UOMS: tuple[tuple[str, str, str, str], ...] = (
    ("PIECE", "Piece", "pcs", "discrete"),
    ("BOX", "Box", "box", "discrete"),
    ("KG", "Kilogram", "kg", "weight"),
    ("LITER", "Liter", "L", "volume"),
    ("METER", "Meter", "m", "length"),
)


async def _sync_units_of_measure_id_sequence(db: AsyncSession) -> None:
    """Align the id sequence with MAX(id) after migration bulk_insert with explicit ids."""
    await db.execute(
        text(
            """
            DO $$
            DECLARE
                seq_name text;
            BEGIN
                seq_name := pg_get_serial_sequence('units_of_measure', 'id');
                IF seq_name IS NOT NULL THEN
                    EXECUTE format(
                        'SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(id) FROM units_of_measure), 1), 1))',
                        seq_name
                    );
                END IF;
            END $$;
            """
        )
    )


async def seed_default_uoms(db: AsyncSession) -> int:
    """Ensure base units of measure exist; return the PIECE uom id (typically 1 after reset)."""
    await _sync_units_of_measure_id_sequence(db)

    for code, name, symbol, category in _DEFAULT_UOMS:
        result = await db.execute(
            insert(UnitOfMeasure)
            .values(
                code=code,
                name=name,
                symbol=symbol,
                measurement_category=category,
            )
            .on_conflict_do_nothing(index_elements=["code"])
        )
        if result.rowcount:
            logger.info("Created unit of measure %s (%s).", code, symbol)

    await _sync_units_of_measure_id_sequence(db)
    await db.flush()
    res = await db.execute(select(UnitOfMeasure.id).where(UnitOfMeasure.code == "PIECE").limit(1))
    piece_id = res.scalar_one_or_none()
    if piece_id is None:
        raise RuntimeError("PIECE unit of measure was not seeded")
    await db.commit()
    return int(piece_id)


async def run_core_seed() -> None:
    """Idempotent bootstrap: roles, CoA, notification templates, optional admin."""
    async with AsyncSessionLocal() as db:
        await seed_default_uoms(db)
        await seed_permissions_and_roles(db)
        await seed_accounting_defaults(db)
        await seed_notification_templates(db)
        if settings.DEFAULT_ADMIN_EMAIL and settings.DEFAULT_ADMIN_PASSWORD:
            await seed_default_admin(
                db,
                settings.DEFAULT_ADMIN_EMAIL,
                settings.DEFAULT_ADMIN_PASSWORD,
            )
            logger.info("Default admin seed attempted for %s.", settings.DEFAULT_ADMIN_EMAIL)
        else:
            logger.info(
                "Skipping default admin seed: DEFAULT_ADMIN_EMAIL or "
                "DEFAULT_ADMIN_PASSWORD is not configured."
            )


async def main() -> None:
    try:
        await run_core_seed()
    finally:
        await close_db()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
