"""Chart account code suggestion."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.chart_accounts import AccountType, ChartAccount
from app.services.chart_account_service import (
    _suggest_child_code,
    suggest_chart_account_code,
)
from app.services.seed_service import seed_accounting_defaults


def test_suggest_child_code_first_child() -> None:
    assert _suggest_child_code("11", []) == "1101"


def test_suggest_child_code_increment() -> None:
    assert _suggest_child_code("11", ["1101", "1102"]) == "1103"


@pytest.mark.asyncio
async def test_suggest_chart_account_code_under_parent(db_session) -> None:
    await seed_accounting_defaults(db_session)
    parent = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1100"))
    ).scalar_one()

    suggested = await suggest_chart_account_code(db_session, parent_id=parent.id)
    assert suggested is not None
    assert suggested.startswith("11")
