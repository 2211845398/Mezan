"""Branch scoping helpers (archival / operational eligibility)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found_error, validation_error
from app.models.branch import Branch, BranchKind


async def require_branch_open_for_operations(db: AsyncSession, branch_id: int) -> Branch:
    """Load a branch and ensure it is not soft-deleted (archived)."""
    res = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = res.scalar_one_or_none()
    if not branch:
        not_found_error("branch_not_found", "Branch not found", branch_id=branch_id)
    if branch.archived_at is not None:
        validation_error(
            "branch_archived",
            "Branch is archived and cannot be used for this operation",
            branch_id=branch_id,
        )
    return branch


async def require_commercial_branch_for_pos(db: AsyncSession, branch_id: int) -> Branch:
    """POS terminals may only be registered on commercial (retail) branches."""
    branch = await require_branch_open_for_operations(db, branch_id)
    if branch.kind != BranchKind.COMMERCIAL:
        validation_error(
            "branch_not_commercial",
            "POS terminals can only be assigned to commercial branches",
            branch_id=branch_id,
            branch_kind=branch.kind,
        )
    return branch


async def require_warehouse_branch_for_purchasing(db: AsyncSession, branch_id: int) -> Branch:
    """Purchase orders may only target warehouse branches."""
    branch = await require_branch_open_for_operations(db, branch_id)
    if branch.kind != BranchKind.WAREHOUSE:
        validation_error(
            "branch_not_warehouse",
            "Purchase orders can only be assigned to warehouse branches",
            branch_id=branch_id,
            branch_kind=branch.kind,
        )
    return branch
