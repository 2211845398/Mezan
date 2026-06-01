"""Plant and upgrade hierarchical Chart of Accounts from :mod:`coa_seed_data`."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting_settings import AccountingSettings
from app.models.chart_accounts import ChartAccount
from app.models.currency import Currency
from app.models.journal_entries import JournalEntryLine
from app.services.coa_seed_data import (
    COA_SEED_FOREST,
    SETTINGS_ACCOUNT_CODES,
    iter_seed_nodes,
)
from app.utils.chart_account_display import normalize_coa_name_fields


async def _load_by_code(db: AsyncSession) -> dict[str, ChartAccount]:
    res = await db.execute(select(ChartAccount))
    return {a.code: a for a in res.scalars().all()}


async def _account_has_journal_lines(db: AsyncSession, account_id: int) -> bool:
    res = await db.execute(
        select(JournalEntryLine.id).where(JournalEntryLine.account_id == account_id).limit(1)
    )
    return res.scalar_one_or_none() is not None


def _node_to_account(
    node,
    *,
    parent_id: int | None,
) -> ChartAccount:
    legacy, ar, en = normalize_coa_name_fields(
        name=node.name_en,
        name_ar=node.name_ar,
        name_en=node.name_en,
    )
    has_children = bool(node.children)
    is_control = node.is_control or has_children
    is_leaf = not is_control
    return ChartAccount(
        code=node.code,
        name=legacy,
        name_ar=ar,
        name_en=en,
        account_type=node.account_type,
        parent_id=parent_id,
        is_control=is_control,
        is_leaf=is_leaf,
        subledger_kind=node.subledger_kind,
        is_system=node.is_system,
        active=True,
    )


async def _plant_nodes_recursive(
    db: AsyncSession,
    nodes: tuple,
    *,
    parent_id: int | None,
    by_code: dict[str, ChartAccount],
) -> dict[str, ChartAccount]:
    for node in nodes:
        if node.code not in by_code:
            acc = _node_to_account(node, parent_id=parent_id)
            db.add(acc)
            await db.flush()
            by_code[node.code] = acc
        acc = by_code[node.code]
        if node.children:
            acc.is_control = True
            acc.is_leaf = False
            await db.flush()
            by_code = await _plant_nodes_recursive(
                db, node.children, parent_id=acc.id, by_code=by_code
            )
        elif not acc.is_control:
            acc.is_leaf = True
            await db.flush()
    return by_code


async def _sync_seed_labels(db: AsyncSession, by_code: dict[str, ChartAccount]) -> None:
    """Backfill bilingual labels on system accounts from seed (idempotent)."""
    for _, node in iter_seed_nodes():
        acc = by_code.get(node.code)
        if acc is None or not acc.is_system:
            continue
        legacy, ar, en = normalize_coa_name_fields(
            name=node.name_en,
            name_ar=node.name_ar,
            name_en=node.name_en,
        )
        if ar and acc.name_ar != ar:
            acc.name_ar = ar
        if en and acc.name_en != en:
            acc.name_en = en
        if legacy and acc.name != legacy:
            acc.name = legacy
    await db.flush()


async def _reparent_system_account(
    db: AsyncSession,
    *,
    by_code: dict[str, ChartAccount],
    child_code: str,
    parent_code: str,
) -> None:
    child = by_code.get(child_code)
    parent = by_code.get(parent_code)
    if child is None or parent is None:
        return
    if not child.is_system:
        return
    if child.parent_id == parent.id:
        return
    if await _account_has_journal_lines(db, child.id):
        return
    child.parent_id = parent.id
    parent.is_control = True
    parent.is_leaf = False
    has_kids = any(c.parent_id == child.id for c in by_code.values())
    if not child.is_control:
        child.is_leaf = not has_kids
    await db.flush()


async def _refresh_parent_leaf_flags(db: AsyncSession, by_code: dict[str, ChartAccount]) -> None:
    for acc in by_code.values():
        children = [c for c in by_code.values() if c.parent_id == acc.id]
        if children:
            acc.is_control = True
            acc.is_leaf = False
        elif not acc.is_control:
            acc.is_leaf = True
    await db.flush()


async def plant_coa_tree(db: AsyncSession) -> dict[str, ChartAccount]:
    """Insert full seed forest (fresh DB). Returns code -> account."""
    by_code = await _load_by_code(db)
    return await _plant_nodes_recursive(db, COA_SEED_FOREST, parent_id=None, by_code=by_code)


async def upgrade_coa_skeleton(db: AsyncSession) -> dict[str, ChartAccount]:
    """Idempotent: add missing seed nodes; gently reparent system accounts without GL history."""
    by_code = await _load_by_code(db)
    by_code = await _plant_nodes_recursive(db, COA_SEED_FOREST, parent_id=None, by_code=by_code)
    await _sync_seed_labels(db, by_code)

    for parent_code, node in iter_seed_nodes():
        if parent_code:
            await _reparent_system_account(
                db, by_code=by_code, child_code=node.code, parent_code=parent_code
            )

    await _refresh_parent_leaf_flags(db, by_code)

    settings = (
        await db.execute(select(AccountingSettings).where(AccountingSettings.id == 1))
    ).scalar_one_or_none()
    if settings is not None:
        await _apply_optional_settings_fks(db, settings, by_code)

    from app.services.branch_accounting_service import provision_all_branches

    await provision_all_branches(db)

    return by_code


async def _apply_optional_settings_fks(
    db: AsyncSession,
    settings: AccountingSettings,
    by_code: dict[str, ChartAccount],
) -> None:
    for attr, (code, required) in SETTINGS_ACCOUNT_CODES.items():
        acc = by_code.get(code)
        if acc is None:
            continue
        current = getattr(settings, attr, None)
        if current is None or (required and current != acc.id):
            setattr(settings, attr, acc.id)
    await db.flush()


async def build_accounting_settings(
    db: AsyncSession,
    *,
    currency_id: int,
    by_code: dict[str, ChartAccount],
) -> AccountingSettings:
    kwargs: dict = {"id": 1, "base_currency_id": currency_id}
    for attr, (code, required) in SETTINGS_ACCOUNT_CODES.items():
        acc = by_code.get(code)
        if acc is None:
            if required:
                raise RuntimeError(f"Missing required seed account code {code}")
            continue
        kwargs[attr] = acc.id
    kwargs["default_loyalty_point_value"] = Decimal("0.01")
    kwargs["inventory_valuation_policy"] = "wavg"
    return AccountingSettings(**kwargs)
