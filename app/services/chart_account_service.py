"""Chart of Accounts management with depth enforcement (Epic 19.2)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import ValidationError
from app.models.chart_accounts import AccountType, ChartAccount, SubledgerKind
from app.models.pos_terminal import POSTerminal
from app.utils.chart_account_display import normalize_coa_name_fields
from app.utils.money import q2

MAX_COA_DEPTH = 5  # Root + 4 sub-levels per spec


async def _account_has_children(db: AsyncSession, account_id: int) -> bool:
    res = await db.execute(
        select(ChartAccount.id).where(ChartAccount.parent_id == account_id).limit(1)
    )
    return res.scalar_one_or_none() is not None


async def _refresh_parent_is_leaf(db: AsyncSession, parent_id: int | None) -> None:
    """Recompute is_leaf on parent after child attach/detach."""
    if parent_id is None:
        return
    parent = await _get_account_with_parents(db, parent_id)
    if parent is None:
        return
    has_children = await _account_has_children(db, parent_id)
    parent.is_leaf = not has_children and not parent.is_control
    await db.flush()


async def _get_account_with_parents(db: AsyncSession, account_id: int) -> ChartAccount | None:
    """Fetch a chart account (walkers use ``parent_id``; no ORM ``parent`` relationship)."""
    result = await db.execute(select(ChartAccount).where(ChartAccount.id == account_id))
    return result.scalar_one_or_none()


async def build_parent_depth_cache(db: AsyncSession) -> dict[int | None, int]:
    """Depth keyed by ``parent_id`` (same semantics as :func:`_calculate_depth`)."""
    res = await db.execute(select(ChartAccount.id, ChartAccount.parent_id))
    parent_by_id: dict[int, int | None] = {int(r.id): r.parent_id for r in res.all()}
    cache: dict[int | None, int] = {}

    def _depth(pid: int | None) -> int:
        if pid in cache:
            return cache[pid]
        if pid is None:
            cache[None] = 1
            return 1
        depth = 1
        current_id = pid
        visited: set[int] = set()
        while current_id is not None:
            if current_id in visited:
                raise ValidationError("Circular reference detected in account hierarchy")
            visited.add(current_id)
            depth += 1
            current_id = parent_by_id.get(current_id)
        cache[pid] = depth
        return depth

    _depth(None)
    for account_id in parent_by_id:
        _depth(account_id)
    return cache


async def _calculate_depth(db: AsyncSession, parent_id: int | None) -> int:
    """Calculate the depth level for a new account under the given parent.

    Root level (no parent) = 1
    Each parent adds 1 to the depth.
    """
    cache = await build_parent_depth_cache(db)
    if parent_id not in cache:
        raise ValidationError(
            "Parent chart account not found",
            details={"parent_id": parent_id},
        )
    return cache[parent_id]


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


async def _validate_location_scope(
    db: AsyncSession,
    *,
    branch_id: int | None,
    pos_terminal_id: int | None,
    is_system: bool,
) -> tuple[int | None, int | None]:
    """Validate optional branch/POS scope; system accounts must stay global."""
    if is_system and (branch_id is not None or pos_terminal_id is not None):
        raise ValidationError("System chart accounts cannot be scoped to a branch or POS terminal")
    eff_branch = branch_id
    eff_terminal = pos_terminal_id
    if pos_terminal_id is not None:
        term = await db.get(POSTerminal, pos_terminal_id)
        if term is None:
            raise ValidationError(
                "Unknown POS terminal",
                details={"pos_terminal_id": pos_terminal_id},
            )
        if eff_branch is not None and eff_branch != term.branch_id:
            raise ValidationError(
                "branch_id does not match the POS terminal's branch",
                details={
                    "branch_id": eff_branch,
                    "pos_terminal_id": pos_terminal_id,
                    "terminal_branch_id": term.branch_id,
                },
            )
        eff_branch = term.branch_id
    if eff_branch is not None:
        from app.models.branch import Branch

        br = await db.get(Branch, eff_branch)
        if br is None:
            raise ValidationError("Unknown branch", details={"branch_id": eff_branch})
    return eff_branch, eff_terminal


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
    subledger_kind: SubledgerKind | None = None,
    name_ar: str | None = None,
    name_en: str | None = None,
    branch_id: int | None = None,
    pos_terminal_id: int | None = None,
) -> ChartAccount:
    """Create a new Chart of Accounts entry with validation."""
    await validate_account_hierarchy(db, parent_id=parent_id, account_type=account_type)

    legacy_name, ar, en = normalize_coa_name_fields(name=name, name_ar=name_ar, name_en=name_en)
    if not legacy_name:
        raise ValidationError("Account name is required")

    eff_branch, eff_terminal = await _validate_location_scope(
        db,
        branch_id=branch_id,
        pos_terminal_id=pos_terminal_id,
        is_system=False,
    )

    kind = subledger_kind if subledger_kind is not None else SubledgerKind.NONE
    if is_control and kind == SubledgerKind.NONE:
        if account_type == AccountType.ASSET:
            kind = SubledgerKind.CUSTOMER
        elif account_type == AccountType.LIABILITY:
            kind = SubledgerKind.SUPPLIER

    account = ChartAccount(
        code=code,
        name=legacy_name,
        name_ar=ar,
        name_en=en,
        account_type=account_type,
        parent_id=parent_id,
        is_control=is_control,
        is_leaf=not is_control,
        subledger_kind=kind,
        is_system=False,
        active=active,
        branch_id=eff_branch,
        pos_terminal_id=eff_terminal,
    )
    db.add(account)
    await db.flush()
    await _refresh_parent_is_leaf(db, parent_id)
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

    old_parent_id = account.parent_id

    if any(k in data for k in ("name", "name_ar", "name_en")):
        legacy_name, ar, en = normalize_coa_name_fields(
            name=data.get("name", account.name),
            name_ar=data.get("name_ar", account.name_ar),
            name_en=data.get("name_en", account.name_en),
        )
        if not legacy_name:
            raise ValidationError("Account name is required")
        data = {**data, "name": legacy_name, "name_ar": ar, "name_en": en}

    eff_branch = data.get("branch_id", account.branch_id)
    eff_terminal = data.get("pos_terminal_id", account.pos_terminal_id)
    if "branch_id" in data or "pos_terminal_id" in data:
        eff_branch, eff_terminal = await _validate_location_scope(
            db,
            branch_id=eff_branch,
            pos_terminal_id=eff_terminal,
            is_system=account.is_system,
        )
        data["branch_id"] = eff_branch
        data["pos_terminal_id"] = eff_terminal

    for key, value in data.items():
        setattr(account, key, value)

    if account.is_control:
        account.is_leaf = False
    elif not await _account_has_children(db, account.id):
        account.is_leaf = True

    await db.flush()
    if old_parent_id != account.parent_id:
        await _refresh_parent_is_leaf(db, old_parent_id)
        await _refresh_parent_is_leaf(db, account.parent_id)
    elif account.parent_id is not None:
        await _refresh_parent_is_leaf(db, account.parent_id)
    await db.refresh(account)
    return account


def _suggest_child_code(parent_code: str, sibling_codes: list[str]) -> str:
    """Suggest the next child account code under *parent_code*."""
    prefix = parent_code
    extensions: list[tuple[int, int]] = []
    for code in sibling_codes:
        if code.startswith(prefix) and len(code) > len(prefix):
            suffix = code[len(prefix) :]
            if suffix.isdigit():
                extensions.append((int(suffix), len(suffix)))

    if extensions:
        next_num = max(n for n, _ in extensions) + 1
        width = max(w for _, w in extensions)
        return f"{prefix}{str(next_num).zfill(max(width, 2))}"

    if prefix.isdigit():
        return f"{prefix}01"

    numeric_siblings = [c for c in sibling_codes if c.isdigit()]
    if numeric_siblings:
        max_code = max(int(c) for c in numeric_siblings)
        width = max(len(c) for c in numeric_siblings)
        return str(max_code + 1).zfill(width)

    return f"{prefix}01"


async def suggest_chart_account_code(
    db: AsyncSession,
    *,
    parent_id: int | None,
) -> str | None:
    """Return the next suggested account code under *parent_id*, or None for roots."""
    if parent_id is None:
        return None

    parent = await _get_account_with_parents(db, parent_id)
    if parent is None:
        raise ValidationError(f"Parent chart account {parent_id} not found")

    result = await db.execute(
        select(ChartAccount.code)
        .where(ChartAccount.parent_id == parent_id)
        .order_by(ChartAccount.code)
    )
    sibling_codes = [row[0] for row in result.all()]
    return _suggest_child_code(parent.code, sibling_codes)


async def get_chart_account(db: AsyncSession, account_id: int) -> ChartAccount | None:
    """Get ChartAccount by ID."""
    result = await db.execute(select(ChartAccount).where(ChartAccount.id == account_id))
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
        stmt = stmt.where(ChartAccount.active)
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
        stmt = stmt.where(ChartAccount.active)
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
            depths[account_id] = (
                calc_depth(account_id=account.parent_id, visited=visited.copy()) + 1
            )
        return depths[account_id]

    for a in accounts:
        calc_depth(a.id)

    # Build tree recursively
    def build_node(account: ChartAccount) -> dict:
        node = {
            "id": account.id,
            "code": account.code,
            "name": account.name,
            "name_ar": account.name_ar,
            "name_en": account.name_en,
            "account_type": account.account_type,
            "is_control": account.is_control,
            "is_leaf": account.is_leaf,
            "subledger_kind": _subledger_kind_value(account.subledger_kind),
            "is_system": account.is_system,
            "active": account.active,
            "branch_id": account.branch_id,
            "pos_terminal_id": account.pos_terminal_id,
            "depth": depths.get(account.id, 1),
            "children": [
                build_node(child)
                for child in sorted(
                    children_map.get(account.id, []),
                    key=lambda c: c.code,
                )
            ],
        }
        return node

    # Get root nodes (parent_id is None or parent not in our set)
    root_ids = {a.id for a in accounts}
    roots = sorted(
        [a for a in accounts if a.parent_id is None or a.parent_id not in root_ids],
        key=lambda a: a.code,
    )

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
            "name_ar": node.get("name_ar"),
            "name_en": node.get("name_en"),
            "account_type": node["account_type"],
            "is_control": node["is_control"],
            "is_leaf": node.get("is_leaf", True),
            "subledger_kind": node.get("subledger_kind", SubledgerKind.NONE),
            "is_system": node["is_system"],
            "active": node["active"],
            "branch_id": node.get("branch_id"),
            "pos_terminal_id": node.get("pos_terminal_id"),
            "depth": node["depth"],
            "branch_total_debit": odr,
            "branch_total_credit": ocr,
            "branch_net": one,
            "branch_subtree_net": st,
            "children": children,
        }

    return [enrich(n) for n in tree]


async def resolve_posting_account_id(db: AsyncSession, account_id: int) -> int:
    """Ensure account_id is an active leaf (posting) account; return it for GL lines."""
    account = await _get_account_with_parents(db, account_id)
    if account is None:
        raise ValidationError(
            "Unknown chart account for journal line",
            details={"account_id": account_id},
        )
    if not account.active:
        raise ValidationError(
            "Cannot post to an inactive chart account",
            details={"account_id": account_id},
        )
    if account.is_control or not account.is_leaf:
        raise ValidationError(
            "Cannot post to a control (summary) account; use a leaf/posting account",
            details={"account_id": account_id, "code": account.code},
        )
    if await _account_has_children(db, account_id):
        raise ValidationError(
            "Cannot post to a parent account; use a leaf posting account",
            details={"account_id": account_id, "code": account.code},
        )
    return int(account.id)


def _subledger_kind_value(kind: SubledgerKind | str) -> str:
    if isinstance(kind, SubledgerKind):
        return kind.value
    return str(kind)


async def _validate_single_account_for_posting(
    db: AsyncSession,
    *,
    aid: int,
    customer_id: int | None = None,
    supplier_id: int | None = None,
    employee_id: int | None = None,
    line_index: int | None = None,
    require_subledger: bool = True,
) -> ChartAccount:
    account = await _get_account_with_parents(db, aid)
    if account is None:
        raise ValidationError(
            "Unknown chart account for journal line",
            details={"account_id": aid, "line": line_index},
        )
    if not account.active:
        raise ValidationError(
            "Cannot post to an inactive chart account",
            details={"account_id": aid, "line": line_index},
        )
    if account.is_control or not account.is_leaf:
        raise ValidationError(
            "Cannot post to a control or non-leaf account; use a leaf posting account",
            details={"account_id": aid, "line": line_index},
        )
    if await _account_has_children(db, aid):
        raise ValidationError(
            "Cannot post to a parent account that has child accounts",
            details={"account_id": aid, "line": line_index},
        )

    sub_dims = sum(1 for x in (customer_id, supplier_id, employee_id) if x is not None)
    if sub_dims > 1:
        raise ValidationError(
            "Journal line may reference at most one sub-ledger entity",
            details={"line": line_index},
        )

    kind = _subledger_kind_value(account.subledger_kind)
    if require_subledger:
        if kind == SubledgerKind.CUSTOMER.value:
            if customer_id is None:
                raise ValidationError(
                    "Customer is required for this receivables account",
                    details={"account_id": aid, "line": line_index},
                )
            if supplier_id is not None or employee_id is not None:
                raise ValidationError(
                    "Only customer_id is allowed for customer sub-ledger lines",
                    details={"line": line_index},
                )
        elif kind == SubledgerKind.SUPPLIER.value:
            if supplier_id is None:
                raise ValidationError(
                    "Supplier is required for this payables account",
                    details={"account_id": aid, "line": line_index},
                )
            if customer_id is not None or employee_id is not None:
                raise ValidationError(
                    "Only supplier_id is allowed for supplier sub-ledger lines",
                    details={"line": line_index},
                )
        elif kind == SubledgerKind.EMPLOYEE.value:
            if employee_id is None:
                raise ValidationError(
                    "Employee is required for this employee sub-ledger account",
                    details={"account_id": aid, "line": line_index},
                )
            if customer_id is not None or supplier_id is not None:
                raise ValidationError(
                    "Only employee_id is allowed for employee sub-ledger lines",
                    details={"line": line_index},
                )
        elif sub_dims > 0:
            raise ValidationError(
                "Sub-ledger entity not allowed for this account",
                details={"account_id": aid, "line": line_index},
            )

    return account


async def _validate_account_hierarchy_chain(db: AsyncSession, account: ChartAccount) -> None:
    aid = account.id
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


async def validate_accounts_for_journal_posting(
    db: AsyncSession,
    *,
    account_ids: list[int] | None = None,
    lines: list[dict] | None = None,
) -> None:
    """Strict CoA checks before GL posting (Epic 19.2 + sub-ledger).

    Pass ``lines`` with account_id and optional customer_id/supplier_id/employee_id
    for per-line sub-ledger validation. Legacy callers may pass ``account_ids`` only.
    """
    if lines is not None:
        for i, ln in enumerate(lines):
            account = await _validate_single_account_for_posting(
                db,
                aid=int(ln["account_id"]),
                customer_id=ln.get("customer_id"),
                supplier_id=ln.get("supplier_id"),
                employee_id=ln.get("employee_id"),
                line_index=i,
            )
            await _validate_account_hierarchy_chain(db, account)
        return

    unique_ids = sorted({int(x) for x in (account_ids or []) if x is not None})
    for aid in unique_ids:
        account = await _validate_single_account_for_posting(db, aid=aid, require_subledger=False)
        await _validate_account_hierarchy_chain(db, account)


async def delete_chart_account(db: AsyncSession, *, account_id: int) -> bool:
    """Delete a Chart of Accounts entry if possible.

    Returns True if deleted, raises ValidationError if not allowed.
    """
    can_delete, reason = await can_delete_account(db, account_id)
    if not can_delete:
        raise ValidationError(reason)

    account = await _get_account_with_parents(db, account_id)
    if account:
        parent_id = account.parent_id
        await db.delete(account)
        await db.flush()
        await _refresh_parent_is_leaf(db, parent_id)
    return True


async def reconcile_chart_account_leaf_flags(db: AsyncSession) -> None:
    """Recompute is_leaf / is_control from parent-child links (fixes stale flags)."""
    res = await db.execute(select(ChartAccount))
    accounts = list(res.scalars().all())
    children_by_parent: dict[int | None, list[ChartAccount]] = {}
    for acc in accounts:
        children_by_parent.setdefault(acc.parent_id, []).append(acc)
    for acc in accounts:
        kids = children_by_parent.get(acc.id, [])
        has_children = len(kids) > 0
        if has_children:
            acc.is_control = True
            acc.is_leaf = False
        elif not acc.is_control:
            acc.is_leaf = True
    await db.flush()


async def list_postable_chart_accounts(
    db: AsyncSession,
    *,
    active_only: bool = True,
) -> list[dict]:
    """Flat list of leaf posting accounts for journal/voucher pickers."""
    child = aliased(ChartAccount)
    has_active_child = exists(
        select(1).where(
            child.parent_id == ChartAccount.id,
            child.active.is_(True),
        )
    )
    stmt = select(ChartAccount).where(
        ChartAccount.is_control.is_(False),
        ~has_active_child,
    )
    if active_only:
        stmt = stmt.where(ChartAccount.active.is_(True))
    stmt = stmt.order_by(ChartAccount.code)
    res = await db.execute(stmt)
    accounts = list(res.scalars().all())
    by_id = {a.id: a for a in accounts}

    rows: list[dict] = []
    for a in accounts:
        parent = by_id.get(a.parent_id) if a.parent_id else None
        if parent is None and a.parent_id is not None:
            parent = await _get_account_with_parents(db, a.parent_id)
        kind = _subledger_kind_value(a.subledger_kind)
        rows.append(
            {
                "id": a.id,
                "code": a.code,
                "name": a.name,
                "name_ar": a.name_ar,
                "name_en": a.name_en,
                "account_type": a.account_type.value
                if hasattr(a.account_type, "value")
                else str(a.account_type),
                "parent_id": a.parent_id,
                "parent_code": parent.code if parent else None,
                "parent_name": parent.name if parent else None,
                "subledger_kind": kind,
                "is_leaf": a.is_leaf,
                "active": a.active,
                "branch_id": a.branch_id,
                "pos_terminal_id": a.pos_terminal_id,
            }
        )
    return rows
