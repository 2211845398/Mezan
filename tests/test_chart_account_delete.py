"""Chart account delete guards."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.models.chart_accounts import AccountType
from app.services.chart_account_service import can_delete_account, create_chart_account


@pytest.mark.asyncio
async def test_can_delete_account_rejects_non_zero_balance(db_session) -> None:
    acc = await create_chart_account(
        db_session,
        code="9999-TEST",
        name="Delete balance test",
        account_type=AccountType.EXPENSE,
        is_control=False,
        is_leaf=True,
    )
    await db_session.commit()

    async def _fake_trial_balance(_db, *, as_of, branch_id=None):
        return [{"account_id": acc.id, "net": Decimal("10.00")}]

    with patch(
        "app.services.financial_reports_service.trial_balance",
        new=AsyncMock(side_effect=_fake_trial_balance),
    ):
        can_delete, reason = await can_delete_account(db_session, acc.id)

    assert can_delete is False
    assert reason == "Account balance must be zero"


@pytest.mark.asyncio
async def test_can_delete_account_allows_zero_balance_leaf(db_session) -> None:
    acc = await create_chart_account(
        db_session,
        code="9998-TEST",
        name="Delete ok test",
        account_type=AccountType.EXPENSE,
        is_control=False,
        is_leaf=True,
    )
    await db_session.commit()

    async def _fake_trial_balance(_db, *, as_of, branch_id=None):
        return []

    with patch(
        "app.services.financial_reports_service.trial_balance",
        new=AsyncMock(side_effect=_fake_trial_balance),
    ):
        can_delete, reason = await can_delete_account(db_session, acc.id)

    assert can_delete is True
    assert reason == ""
