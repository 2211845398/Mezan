"""Chart of Accounts management with depth enforcement (Epic 19.2)."""

from __future__ import annotations

from typing import Any

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.errors import ValidationError
from app.models.chart_accounts import AccountType, ChartAccount
from app.utils.money import q2


MAX_COA_DEPTH = 5  # Root + 4 sub-levels per spec


async def _get_account_with_parents(
    db: AsyncSession, account_id: int
) -> ChartAccount | None:
    """Fetch a chart account (walkers use ``parent_id``; no ORM ``parent`` relationship)."""
    result = await db.execute(select(ChartAccount).where(ChartAccount.id == account_id))
    return result.scalar_one_or_none()


async def _calculate_depth(db: AsyncSession, parent_id: int | None) -> int:
    """Calculate the depth level for a new account under the given parent.

    Root level (no parent) = 1
    Each parent adds 1 to the depth.
    """
    if parent_id is None:
        return 1

    depth = 1
    current_id = parent_id
    visited = set()

    while current_id is not None:
        if current_id in visited:
            raise ValidationError("Circular reference detected in account hierarchy")
        visited.add(current_id)

        account = await _get_account_with_parents(db, current_id)
        if account is None:
            break
        depth += 1
        current_id = account.parent_id

    return depth


async def _get_root_type(db: AsyncSession, account_id: int | None) -> AccountType | None:
    """Walk up to root and return the root account_type."""
    if account_id is None:
        return None

    current_id = account_id
    visited = set()
    current_type = None

    while current_id is not None:
        if current_id in visited:
            raise ValidationError("Circular reference detected in account hierarchy")
        visited.add(current_id)

        account = await _get_account_with_parents(db, current_id)
        if account is None:
            break
        current_type = account.account_type
        current_id = account.parent_id

    return current_type


async def validate_account_hierarchy(
    db: AsyncSession,
    *,
    parent_id: int | None,
    account_type: AccountType,
    account_id: int | None = None,
) -> None:
    """Validate depth limit and type consistency for Chart of Accounts.

    Args:
        db: Database session
        parent_id: Proposed parent account ID
        account_type: Proposed account type
        account_id: Current account ID (for updates, to prevent self-reference)

    Raises:
        ValidationError: If depth exceeds MAX_COA_DEPTH or type mismatch
    """
    # Prevent self-reference
    if account_id is not None and parent_id == account_id:
        raise ValidationError("Account cannot be its own parent")

    # Check depth limit
    proposed_depth = await _calculate_depth(db, parent_id)
    if proposed_depth > MAX_COA_DEPTH:
        raise ValidationError(
            f"Chart of Accounts depth limit ({MAX_COA_DEPTH}) exceeded. "
            f"Proposed depth: {proposed_depth}"
        )

    # Check type consistency with root
    if parent_id is not None:
        root_type = await _get_root_type(db, parent_id)
        if root_type is not None and root_type != account_type:
            raise ValidationError(
                f"Account type '{account_type.value}' does not match parent hierarchy "
                f"root type '{root_type.value}'. All accounts in a hierarchy must share the same top-level type."
            )


async def create_chart_account(
    db: AsyncSession,
    *,
    code: str,
    name: str,
    account_type: AccountType,
    parent_id: int | None = None,
    is_control: bool = False,
    active: bool = True,
) -> ChartAccount:
    """Create a new Chart of Accounts entry with validation."""
    await validate_account_hierarchy(
        db, parent_id=parent_id, account_type=account_type
    )

    account = ChartAccount(
        code=code,
        name=name,
        account_type=account_type,
        parent_id=parent_id,
        is_control=is_control,
        is_system=False,
        active=active,
    )
    db.add(account)
    await db.flush()
    await db.refresh(account)
    return account


async def update_chart_account(
    db: AsyncSession,
    *,
    account_id: int,
    data: dict[str, Any],
) -> ChartAccount:
    """Update Chart of Accounts entry with validation.

    Validates parent_id changes for depth and type consistency.
    """
    account = await _get_account_with_parents(db, account_id)
    if account is None:
        raise ValidationError(f"Chart account {account_id} not found")

    # Cannot modify system accounts
    if account.is_system:
        raise ValidationError("System accounts cannot be modified")

    new_parent_id = data.get("parent_id")
    new_type_str = data.get("account_type")
    new_type = AccountType(new_type_str) if new_type_str else account.account_type

    # Validate if parent or type is changing
    if new_parent_id != account.parent_id or new_type != account.account_type:
        await validate_account_hierarchy(
            db,
            parent_id=new_parent_id,
            account_type=new_type,
            account_id=account_id,
        )

    # Check that we're not creating a cycle by moving a parent under its own child
    if new_parent_id is not None:
        # Walk up from proposed new parent to ensure we don't hit account_id
        current_id = new_parent_id
        visited = set()
        while current_id is not None:
            if current_id == account_id:
                raise ValidationError("Cannot move an account under its own descendant")
            if current_id in visited:
                break
            visited.add(current_id)
            parent = await _get_account_with_parents(db, current_id)
            current_id = parent.parent_id if parent else None

    for key, value in data.items():
        setattr(account, key, value)

    await db.flush()
    await db.refresh(account)
    return account


async def get_chart_account(db: AsyncSession, account_id: int) -> ChartAccount | None:
    """Get ChartAccount by ID."""
    result = await db.execute(
        select(ChartAccount).where(ChartAccount.id == account_id)
    )
    return result.scalar_one_or_none()


async def list_chart_accounts(
    db: AsyncSession,
    *,
    active_only: bool = True,
    account_type: AccountType | None = None,
) -> list[ChartAccount]:
    """List Chart of Accounts with optional filtering."""
    stmt = select(ChartAccount)

    if active_only:
        stmt = stmt.where(ChartAccount.active == True)
    if account_type:
        stmt = stmt.where(ChartAccount.account_type == account_type)

    stmt = stmt.order_by(ChartAccount.code)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_account_depth(db: AsyncSession, account_id: int) -> int:
    """Get the depth level of an existing account."""
    account = await _get_account_with_parents(db, account_id)
    if account is None:
        raise ValidationError(f"Chart account {account_id} not found")

    return await _calculate_depth(db, account.parent_id)


async def can_delete_account(db: AsyncSession, account_id: int) -> tuple[bool, str]:
    """Check if an account can be safely deleted.

    Returns (can_delete, reason).
    """
    account = await _get_account_with_parents(db, account_id)
    if account is None:
        return False, "Account not found"

    if account.is_system:
        return False, "System accounts cannot be deleted"

    # Check for children
    children_result = await db.execute(
        select(ChartAccount).where(ChartAccount.parent_id == account_id)
    )
    children = children_result.scalars().all()
    if children:
        return False, f"Account has {len(children)} child account(s)"

    # Check for journal entries
    from app.models.journal_entries import JournalEntryLine

    je_result = await db.execute(
        select(JournalEntryLine).where(JournalEntryLine.account_id == account_id).limit(1)
    )
    if je_result.scalar_one_or_none():
        return False, "Account has posted journal entries"

    return True, ""


async def get_chart_account_tree(
    db: AsyncSession,
    *,
    account_type: AccountType | None = None,
    active_only: bool = True,
) -> list[dict]:
    """Get Chart of Accounts as a tree structure (Epic 19.9).

    Returns a list of root nodes with nested children.
    """
    # Get all accounts
    stmt = select(ChartAccount)
    if active_only:
        stmt = stmt.where(ChartAccount.active == True)
    if account_type:
        stmt = stmt.where(ChartAccount.account_type == account_type)

    result = await db.execute(stmt)
    accounts = list(result.scalars().all())

    # Build lookup
    by_id: dict[int, ChartAccount] = {a.id: a for a in accounts}
    children_map: dict[int | None, list[ChartAccount]] = {}

    for a in accounts:
        parent_id = a.parent_id
        if parent_id not in children_map:
            children_map[parent_id] = []
        children_map[parent_id].append(a)

    # Calculate depths
    depths: dict[int, int] = {}

    def calc_depth(account_id: int, visited: set[int] | None = None) -> int:
        if visited is None:
            visited = set()
        if account_id in visited:
            return 1  # Prevent infinite loop
        if account_id in depths:
            return depths[account_id]

        visited.add(account_id)
        account = by_id.get(account_id)
        if account is None or account.parent_id is None:
            depths[account_id] = 1
        else:
            depths[account_id] = calc_depth(account_id=account.parent_id, visited=visited.copy()) + 1
        return depths[account_id]

    for a in accounts:
        calc_depth(a.id)

    # Build tree recursively
    def build_node(account: ChartAccount) -> dict:
        node = {
            "id": account.id,
            "code": account.code,
            "name": account.name,
            "account_type": account.account_type,
            "is_control": account.is_control,
            "is_system": account.is_system,
            "active": account.active,
            "depth": depths.get(account.id, 1),
            "children": [build_node(child) for child in children_map.get(account.id, [])],
        }
        return node

    # Get root nodes (parent_id is None or parent not in our set)
    root_ids = {a.id for a in accounts}
    roots = [a for a in accounts if a.parent_id is None or a.parent_id not in root_ids]

    return [build_node(root) for root in roots]


async def get_chart_account_tree_for_branch(
    db: AsyncSession,
    *,
    branch_id: int,
    as_of: date,
    active_only: bool = True,
) -> list[dict]:
    """Same hierarchy as :func:`get_chart_account_tree`, plus branch-scoped TB balances."""
    from app.services.financial_reports_service import trial_balance

    tree = await get_chart_account_tree(db, account_type=None, active_only=active_only)
    tb_rows = await trial_balance(db, as_of=as_of, branch_id=branch_id)
    tb_by_id = {r["account_id"]: r for r in tb_rows}

    def collect_subtree_ids(node: dict) -> set[int]:
        s = {node["id"]}
        for c in node.get("children", []):
            s |= collect_subtree_ids(c)
        return s

    def enrich(node: dict) -> dict:
        raw_children = node.get("children", [])
        children = [enrich(c) for c in raw_children]
        own = tb_by_id.get(node["id"])
        odr = q2(own["total_debit"]) if own else Decimal("0")
        ocr = q2(own["total_credit"]) if own else Decimal("0")
        one = q2(own["net"]) if own else Decimal("0")
        ids = collect_subtree_ids(node)
        st = Decimal("0")
        for aid in ids:
            row = tb_by_id.get(aid)
            if row:
                st += q2(row["net"])
        st = q2(st)
        return {
            "id": node["id"],
            "code": node["code"],
            "name": node["name"],
            "account_type": node["account_type"],
            "is_control": node["is_control"],
            "is_system": node["is_system"],
            "active": node["active"],
            "depth": node["depth"],
            "branch_total_debit": odr,
            "branch_total_credit": ocr,
            "branch_net": one,
            "branch_subtree_net": st,
            "children": children,
        }

    return [enrich(n) for n in tree]


async def validate_accounts_for_journal_posting(
    db: AsyncSession, *, account_ids: list[int]
) -> None:
    """Strict CoA checks before GL posting (Epic 19.2).

    Ensures each account exists, is active, is not a control-only node, sits within
    max depth, and has a type-consistent ancestor chain.
    """
    unique_ids = sorted({int(x) for x in account_ids if x is not None})
    for aid in unique_ids:
        account = await _get_account_with_parents(db, aid)
        if account is None:
            raise ValidationError(
                "Unknown chart account for journal line",
                details={"account_id": aid},
            )
        if not account.active:
            raise ValidationError(
                "Cannot post to an inactive chart account",
                details={"account_id": aid},
            )
        if account.is_control:
            raise ValidationError(
                "Cannot post to a control (summary) account; use a leaf/posting account",
                details={"account_id": aid},
            )

        depth = await _calculate_depth(db, account.parent_id)
        if depth > MAX_COA_DEPTH:
            raise ValidationError(
                f"Chart account exceeds maximum depth ({MAX_COA_DEPTH})",
                details={"account_id": aid, "depth": depth},
            )

        leaf_type = account.account_type
        current_id: int | None = account.id
        visited: set[int] = set()
        while current_id is not None:
            if current_id in visited:
                raise ValidationError(
                    "Circular reference detected in chart hierarchy",
                    details={"account_id": aid},
                )
            visited.add(current_id)
            cur = await _get_account_with_parents(db, current_id)
            if cur is None:
                break
            if cur.account_type != leaf_type:
                raise ValidationError(
                    "Account type does not match ancestor chain (CoA type consistency)",
                    details={
                        "account_id": aid,
                        "expected_type": leaf_type.value,
                        "ancestor_id": cur.id,
                        "ancestor_type": cur.account_type.value,
                    },
                )
            current_id = cur.parent_id


async def delete_chart_account(db: AsyncSession, *, account_id: int) -> bool:
    """Delete a Chart of Accounts entry if possible.

    Returns True if deleted, raises ValidationError if not allowed.
    """
    can_delete, reason = await can_delete_account(db, account_id)
    if not can_delete:
        raise ValidationError(reason)

    account = await _get_account_with_parents(db, account_id)
    if account:
        await db.delete(account)
        await db.flush()
    return True
