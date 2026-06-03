"""Branch- and terminal-scoped operating accounts (CoA Phase 3).

Global system codes (``1000``, ``1110``, ``2010``, …) remain company-wide posting
defaults. Each branch gets a leaf cash account under ``10100``; each POS terminal may
get a dedicated cash leaf for drawer settlement.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.accounting_settings import AccountingSettings
from app.models.branch import Branch
from app.models.chart_accounts import AccountType, ChartAccount
from app.models.customer_profile import CustomerProfile
from app.models.pos_terminal import POSTerminal
from app.models.suppliers import Supplier
from app.services.accounting_service import get_accounting_settings
from app.services.chart_account_service import create_chart_account, resolve_posting_account_id

_CASH_GROUP_CODE = "10100"
_CODE_SLUG_RE = re.compile(r"[^A-Z0-9]+")


def _slug_code_part(value: str, *, max_len: int = 20) -> str:
    slug = _CODE_SLUG_RE.sub("", (value or "").upper())
    return (slug or "X")[:max_len]


def branch_cash_account_code(branch: Branch) -> str:
    return f"CASH-{_slug_code_part(branch.code)}"[:32]


def terminal_cash_account_code(terminal: POSTerminal) -> str:
    return f"POS-{_slug_code_part(terminal.terminal_code)}"[:32]


async def _cash_group_parent_id(db: AsyncSession) -> int:
    res = await db.execute(
        select(ChartAccount.id).where(
            ChartAccount.code == _CASH_GROUP_CODE,
            ChartAccount.active.is_(True),
        )
    )
    parent_id = res.scalar_one_or_none()
    if parent_id is None:
        raise ValidationError(
            "Cash group account is missing; run accounting seed / CoA upgrade first",
            details={"expected_code": _CASH_GROUP_CODE},
        )
    return int(parent_id)


async def _find_branch_cash(db: AsyncSession, branch_id: int) -> ChartAccount | None:
    res = await db.execute(
        select(ChartAccount).where(
            ChartAccount.branch_id == branch_id,
            ChartAccount.pos_terminal_id.is_(None),
            ChartAccount.account_type == AccountType.ASSET,
            ChartAccount.is_leaf.is_(True),
            ChartAccount.active.is_(True),
        )
    )
    for acc in res.scalars().all():
        if acc.code.startswith("CASH-"):
            return acc
    return None


async def _find_terminal_cash(db: AsyncSession, terminal_id: int) -> ChartAccount | None:
    res = await db.execute(
        select(ChartAccount).where(
            ChartAccount.pos_terminal_id == terminal_id,
            ChartAccount.is_leaf.is_(True),
            ChartAccount.active.is_(True),
        )
    )
    return res.scalar_one_or_none()


async def ensure_branch_cash_account(db: AsyncSession, branch_id: int) -> ChartAccount:
    """Idempotent: leaf cash account scoped to ``branch_id`` under ``10100``."""
    existing = await _find_branch_cash(db, branch_id)
    if existing is not None:
        return existing

    branch = await db.get(Branch, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found", details={"branch_id": branch_id})

    parent_id = await _cash_group_parent_id(db)
    code = branch_cash_account_code(branch)
    dup = await db.execute(select(ChartAccount.id).where(ChartAccount.code == code))
    if dup.scalar_one_or_none() is not None:
        raise ValidationError(
            "Branch cash account code already exists for another branch",
            details={"code": code, "branch_id": branch_id},
        )

    label_en = f"Cash — {branch.name}"
    label_ar = f"نقد — {branch.name}"
    return await create_chart_account(
        db,
        code=code,
        name=label_en,
        name_ar=label_ar,
        name_en=label_en,
        account_type=AccountType.ASSET,
        parent_id=parent_id,
        is_control=False,
        branch_id=branch_id,
        pos_terminal_id=None,
    )


async def ensure_terminal_cash_account(db: AsyncSession, terminal_id: int) -> ChartAccount:
    """Idempotent: terminal drawer cash under the branch cash group."""
    existing = await _find_terminal_cash(db, terminal_id)
    if existing is not None:
        return existing

    terminal = await db.get(POSTerminal, terminal_id)
    if terminal is None:
        raise NotFoundError("POS terminal not found", details={"pos_terminal_id": terminal_id})

    await ensure_branch_cash_account(db, terminal.branch_id)
    parent_id = await _cash_group_parent_id(db)
    code = terminal_cash_account_code(terminal)
    dup = await db.execute(select(ChartAccount.id).where(ChartAccount.code == code))
    if dup.scalar_one_or_none() is not None:
        raise ValidationError(
            "Terminal cash account code already exists",
            details={"code": code, "terminal_id": terminal_id},
        )

    label_en = f"POS Cash — {terminal.name}"
    label_ar = f"نقد نقطة بيع — {terminal.name}"
    return await create_chart_account(
        db,
        code=code,
        name=label_en,
        name_ar=label_ar,
        name_en=label_en,
        account_type=AccountType.ASSET,
        parent_id=parent_id,
        is_control=False,
        branch_id=terminal.branch_id,
        pos_terminal_id=terminal.id,
    )


def _global_clearing_account_id(settings: AccountingSettings, tender: str) -> int:
    if tender == "card":
        return settings.default_card_clearing_account_id
    if tender == "transfer":
        return getattr(
            settings, "default_bank_transfer_account_id", settings.default_cash_account_id
        )
    if tender == "other":
        return settings.default_other_clearing_account_id
    return settings.default_cash_account_id


async def resolve_settlement_account_id(
    db: AsyncSession,
    settings: AccountingSettings,
    tender: str,
    *,
    branch_id: int,
    terminal_id: int | None = None,
) -> int:
    """Resolve cash/card/transfer clearing for POS and branch settlements."""
    normalized = tender if tender in ("cash", "card", "transfer", "other") else "cash"
    if normalized == "cash":
        if terminal_id is not None:
            acc = await ensure_terminal_cash_account(db, terminal_id)
            return int(acc.id)
        acc = await ensure_branch_cash_account(db, branch_id)
        return int(acc.id)
    return _global_clearing_account_id(settings, normalized)


async def resolve_ar_account_id(
    db: AsyncSession,
    settings: AccountingSettings,
    *,
    customer_id: int | None,
) -> int:
    if customer_id is not None:
        customer = await db.get(CustomerProfile, customer_id)
        if customer is not None and customer.receivables_account_id is not None:
            return await resolve_posting_account_id(db, customer.receivables_account_id)
    return int(settings.default_ar_account_id)


async def resolve_ap_account_id(
    db: AsyncSession,
    settings: AccountingSettings,
    *,
    supplier_id: int | None,
) -> int:
    if supplier_id is not None:
        supplier = await db.get(Supplier, supplier_id)
        if supplier is not None and supplier.payables_account_id is not None:
            return await resolve_posting_account_id(db, supplier.payables_account_id)
    return int(settings.default_ap_account_id)


async def provision_branch_accounting(db: AsyncSession, *, branch_id: int) -> ChartAccount:
    """Provision branch cash account and stamp onboarding metadata."""
    cash = await ensure_branch_cash_account(db, branch_id)
    res = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = res.scalar_one_or_none()
    if branch is None:
        raise NotFoundError("Branch not found", details={"branch_id": branch_id})
    branch.accounting_chart_provisioned_at = datetime.now(UTC)
    await db.flush()
    return cash


async def provision_all_branches(db: AsyncSession) -> None:
    """Backfill branch cash accounts for branches not yet marked provisioned (idempotent)."""
    res = await db.execute(
        select(Branch.id).where(
            Branch.archived_at.is_(None),
            Branch.accounting_chart_provisioned_at.is_(None),
        )
    )
    for (bid,) in res.all():
        await provision_branch_accounting(db, branch_id=int(bid))


async def default_receivables_account_id(db: AsyncSession) -> int:
    settings = await get_accounting_settings(db)
    return int(settings.default_ar_account_id)


async def default_payables_account_id(db: AsyncSession) -> int:
    settings = await get_accounting_settings(db)
    return int(settings.default_ap_account_id)
