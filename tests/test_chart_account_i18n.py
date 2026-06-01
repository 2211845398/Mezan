"""Chart of accounts bilingual names and location scope (Phase 1)."""

from __future__ import annotations

import pytest

from app.core.errors import ValidationError
from app.models.chart_accounts import AccountType
from app.services.chart_account_service import create_chart_account
from app.services.seed_service import seed_accounting_defaults
from app.utils.chart_account_display import normalize_coa_name_fields, resolve_account_display_name


def test_normalize_coa_name_fields_fallbacks() -> None:
    legacy, ar, en = normalize_coa_name_fields(name="Legacy", name_ar="عربي", name_en="English")
    assert legacy == "Legacy"
    assert ar == "عربي"
    assert en == "English"


def test_resolve_account_display_name_ar_en() -> None:
    class Row:
        name = "Fallback"
        name_ar = "نقد"
        name_en = "Cash"

    assert resolve_account_display_name(Row(), "ar") == "نقد"
    assert resolve_account_display_name(Row(), "en") == "Cash"
    assert resolve_account_display_name(Row(), "en-US") == "Cash"


@pytest.mark.asyncio
async def test_create_chart_account_with_bilingual_and_branch(db_session) -> None:
    await seed_accounting_defaults(db_session)
    from app.models.branch import Branch

    branch = Branch(
        name="CoA Branch",
        code="COA-B1",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    acc = await create_chart_account(
        db_session,
        code="1999",
        name="Branch Cash",
        name_ar="نقد فرع",
        name_en="Branch Cash EN",
        account_type=AccountType.ASSET,
        parent_id=None,
        is_control=False,
        branch_id=branch.id,
    )
    assert acc.name_en == "Branch Cash EN"
    assert acc.name_ar == "نقد فرع"
    assert acc.branch_id == branch.id
    assert acc.pos_terminal_id is None


@pytest.mark.asyncio
async def test_system_account_cannot_have_branch_scope(db_session) -> None:
    await seed_accounting_defaults(db_session)
    from sqlalchemy import select

    from app.models.chart_accounts import ChartAccount

    cash = (
        await db_session.execute(select(ChartAccount).where(ChartAccount.code == "1000"))
    ).scalar_one()

    with pytest.raises(ValidationError, match="System chart accounts"):
        await create_chart_account(
            db_session,
            code="9998",
            name="Should fail",
            account_type=AccountType.ASSET,
            branch_id=1,
        )

    assert cash.is_system is True
