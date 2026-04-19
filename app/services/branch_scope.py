"""Branch scoping helpers (archival / operational eligibility)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.branch import Branch


async def require_branch_open_for_operations(db: AsyncSession, branch_id: int) -> Branch:
    """Load a branch and ensure it is not soft-deleted (archived)."""
    res = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = res.scalar_one_or_none()
    if not branch:
        raise NotFoundError("Branch not found", details={"branch_id": branch_id})
    if branch.archived_at is not None:
        raise ValidationError(
            "Branch is archived and cannot be used for this operation",
            details={"branch_id": branch_id},
        )
    return branch
