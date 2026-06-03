"""Branch scoping helpers (archival / operational eligibility)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found_error, validation_error
from app.models.branch import Branch


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
