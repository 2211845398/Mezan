"""Branch-level accounting provisioning (Epic 19.7).

The chart of accounts is global; each branch is marked as provisioned for GL so
reporting and integrations can rely on branch onboarding metadata.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.branch import Branch


async def provision_branch_accounting(db: AsyncSession, *, branch_id: int) -> None:
    """Stamp ``accounting_chart_provisioned_at`` for a branch (idempotent re-stamp allowed)."""
    res = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = res.scalar_one_or_none()
    if branch is None:
        raise NotFoundError("Branch not found", details={"branch_id": branch_id})
    branch.accounting_chart_provisioned_at = datetime.now(UTC)
    await db.flush()
