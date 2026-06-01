"""Core seed module tests."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models.chart_accounts import ChartAccount
from app.models.permission import Permission
from app.models.unit_of_measure import UnitOfMeasure
from app.scripts import core_seed, seed as seed_script
from app.scripts.core_seed import seed_default_uoms
from app.services.seed_service import (
    seed_accounting_defaults,
    seed_notification_templates,
    seed_permissions_and_roles,
)


def test_seed_script_delegates_to_core_seed() -> None:
    assert seed_script.run_seed is not core_seed.run_core_seed
    import inspect

    source = inspect.getsource(seed_script.run_seed)
    assert "run_core_seed" in source


@pytest.mark.asyncio
async def test_seed_default_uoms_is_idempotent(db_session) -> None:
    piece_id = await seed_default_uoms(db_session)
    uom_n1 = await db_session.scalar(select(func.count()).select_from(UnitOfMeasure))

    piece_id_2 = await seed_default_uoms(db_session)
    uom_n2 = await db_session.scalar(select(func.count()).select_from(UnitOfMeasure))

    assert piece_id_2 == piece_id
    assert uom_n2 == uom_n1
    assert uom_n1 and uom_n1 >= len(core_seed._DEFAULT_UOMS)


@pytest.mark.asyncio
async def test_core_seed_steps_are_idempotent(db_session) -> None:
    await seed_default_uoms(db_session)
    await seed_permissions_and_roles(db_session)
    perm_n1 = await db_session.scalar(select(func.count()).select_from(Permission))

    await seed_accounting_defaults(db_session)
    coa_n1 = await db_session.scalar(select(func.count()).select_from(ChartAccount))

    await seed_notification_templates(db_session)
    await seed_permissions_and_roles(db_session)
    await seed_accounting_defaults(db_session)

    perm_n2 = await db_session.scalar(select(func.count()).select_from(Permission))
    coa_n2 = await db_session.scalar(select(func.count()).select_from(ChartAccount))

    assert perm_n2 == perm_n1
    assert coa_n2 == coa_n1
    assert coa_n1 and coa_n1 > 0
