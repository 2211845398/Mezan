"""Manual seed entrypoint for permissions, accounting defaults, and admin bootstrap."""

from __future__ import annotations

import asyncio
import logging

from app.db.database import close_db
from app.scripts.core_seed import run_core_seed

logger = logging.getLogger(__name__)


async def run_seed() -> None:
    """Execute the idempotent core seed routines once."""
    await run_core_seed()


async def main() -> None:
    """Run the seed flow and close the shared engine cleanly."""
    try:
        await run_seed()
    finally:
        await close_db()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
