"""Chart of accounts tree child ordering."""

from __future__ import annotations

import uuid

import pytest

from app.models.chart_accounts import AccountType
from app.services.chart_account_service import create_chart_account, get_chart_account_tree
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_tree_children_sorted_by_code(db_session) -> None:
    await seed_accounting_defaults(db_session)
    suffix = uuid.uuid4().hex[:6]
    parent = await create_chart_account(
        db_session,
        code=f"99{suffix[:2]}",
        name="Sort Parent",
        account_type=AccountType.ASSET,
        parent_id=None,
        is_control=True,
    )
    await create_chart_account(
        db_session,
        code=f"99{suffix[:2]}03",
        name="Child C",
        account_type=AccountType.ASSET,
        parent_id=parent.id,
        is_control=False,
    )
    await create_chart_account(
        db_session,
        code=f"99{suffix[:2]}01",
        name="Child A",
        account_type=AccountType.ASSET,
        parent_id=parent.id,
        is_control=False,
    )
    await create_chart_account(
        db_session,
        code=f"99{suffix[:2]}02",
        name="Child B",
        account_type=AccountType.ASSET,
        parent_id=parent.id,
        is_control=False,
    )
    await db_session.flush()

    tree = await get_chart_account_tree(db_session, active_only=False)
    parent_node = next(n for n in tree if n["id"] == parent.id)
    child_codes = [c["code"] for c in parent_node["children"]]
    assert child_codes == sorted(child_codes)
