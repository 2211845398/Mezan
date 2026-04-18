"""Document numbering helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.branch import Branch
from app.models.branch_sequence import BranchSequence


async def next_sales_invoice_number(
    db: AsyncSession,
    *,
    branch_id: int,
    issued_at: datetime | None = None,
) -> str:
    """Allocate the next per-branch invoice number inside the current transaction."""
    issued_at = issued_at or datetime.now(UTC)
    sequence_year = issued_at.year

    branch_res = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = branch_res.scalar_one_or_none()
    if not branch:
        raise NotFoundError("Branch not found", details={"branch_id": branch_id})

    await db.execute(
        insert(BranchSequence)
        .values(branch_id=branch_id, year=sequence_year, next_number=1)
        .on_conflict_do_nothing(index_elements=["branch_id", "year"])
    )

    sequence_res = await db.execute(
        select(BranchSequence)
        .where(
            BranchSequence.branch_id == branch_id,
            BranchSequence.year == sequence_year,
        )
        .with_for_update()
    )
    sequence = sequence_res.scalar_one()
    next_number = sequence.next_number
    sequence.next_number += 1
    await db.flush()

    return f"INV-{branch.code}-{sequence_year}-{next_number:06d}"
