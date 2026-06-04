"""Hierarchical CoA seed structure (Phase 2)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.accounting_settings import AccountingSettings
from app.models.chart_accounts import ChartAccount, SubledgerKind
from app.services.chart_account_service import list_postable_chart_accounts
from app.services.coa_seed_data import iter_seed_nodes
from app.services.coa_seed_service import upgrade_coa_skeleton
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_fresh_seed_has_hierarchical_system_accounts(db_session) -> None:
    await seed_accounting_defaults(db_session)

    cash = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1000"))
    ).scalar_one()
    assert cash.is_system is True
    assert cash.parent_id is not None
    parent = await db_session.get(ChartAccount, cash.parent_id)
    assert parent is not None
    assert parent.code == "10100"

    ar = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1110"))
    ).scalar_one()
    assert ar.is_system is True
    assert ar.subledger_kind == SubledgerKind.CUSTOMER

    settings = (
        await db_session.execute(select(AccountingSettings).where(AccountingSettings.id == 1))
    ).scalar_one()
    assert settings.default_ar_account_id == ar.id
    assert settings.default_cash_account_id == cash.id
    assert settings.default_wip_account_id is not None


@pytest.mark.asyncio
async def test_upgrade_coa_skeleton_idempotent(db_session) -> None:
    """Legacy flat seed can be upgraded without duplicate codes."""

    from app.models.chart_accounts import AccountType

    legacy_cash = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1000"))
    ).scalar_one_or_none()
    if legacy_cash is None:
        db_session.add(
            ChartAccount(
                code="1000",
                name="Cash",
                name_en="Cash",
                name_ar="Cash",
                account_type=AccountType.ASSET,
                parent_id=None,
                is_control=False,
                is_leaf=True,
                is_system=True,
                active=True,
            )
        )
        await db_session.flush()

    before = (await db_session.execute(select(ChartAccount))).scalars().all()
    n_before = len(before)

    await upgrade_coa_skeleton(db_session)
    await db_session.commit()

    after = (await db_session.execute(select(ChartAccount))).scalars().all()
    if legacy_cash is None:
        assert len(after) > n_before
    else:
        assert len(after) >= n_before
    codes = {a.code for a in after}
    assert "10000" in codes
    assert "10100" in codes

    await upgrade_coa_skeleton(db_session)
    await db_session.commit()
    after2 = (await db_session.execute(select(ChartAccount))).scalars().all()
    assert len(after2) == len(after)


@pytest.mark.asyncio
async def test_postable_accounts_after_seed(db_session) -> None:
    """Journal pickers must see leaf accounts after CoA seed."""
    await seed_accounting_defaults(db_session)
    rows = await list_postable_chart_accounts(db_session)
    assert len(rows) > 0
    codes = {r["code"] for r in rows}
    assert "1000" in codes


def test_seed_forest_covers_required_posting_codes() -> None:
    required = {
        "1000",
        "1010",
        "1015",
        "1110",
        "2010",
        "1200",
        "4000",
        "5000",
        "6000",
        "1020",
        "2150",
        "6100",
        "4090",
        "2100",
        "2110",
        "2200",
    }
    codes = {node.code for _, node in iter_seed_nodes()}
    assert required.issubset(codes)
