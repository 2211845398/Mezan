"""Manual seed entrypoint for permissions, accounting defaults, and admin bootstrap."""

from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.db.database import AsyncSessionLocal, close_db
from app.services.seed_service import (
    seed_accounting_defaults,
    seed_default_admin,
    seed_permissions_and_roles,
)

logger = logging.getLogger(__name__)


async def run_seed() -> None:
    """Execute the idempotent seed routines once."""
    async with AsyncSessionLocal() as db:
        await seed_permissions_and_roles(db)
        await seed_accounting_defaults(db)
        if settings.DEFAULT_ADMIN_EMAIL and settings.DEFAULT_ADMIN_PASSWORD:
            await seed_default_admin(
                db,
                settings.DEFAULT_ADMIN_EMAIL,
                settings.DEFAULT_ADMIN_PASSWORD,
            )
            logger.info("Default admin seed attempted for %s.", settings.DEFAULT_ADMIN_EMAIL)
        else:
            logger.info(
                "Skipping default admin seed because DEFAULT_ADMIN_EMAIL or "
                "DEFAULT_ADMIN_PASSWORD is not configured."
            )


async def main() -> None:
    """Run the seed flow and close the shared engine cleanly."""
    try:
        await run_seed()
    finally:
        await close_db()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
