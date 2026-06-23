"""CRUD for per-branch inventory policies."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.inventory_policy import InventoryPolicy
from app.schemas.inventory_policy import InventoryPolicyRead


async def get_policy(
    db: AsyncSession, *, branch_id: int, product_id: int
) -> InventoryPolicy | None:
    res = await db.execute(
        select(InventoryPolicy).where(
            and_(
                InventoryPolicy.branch_id == branch_id,
                InventoryPolicy.product_id == product_id,
            )
        )
    )
    return res.scalar_one_or_none()


async def upsert_policy(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    reorder_point: int | None = None,
    reorder_qty: int | None = None,
    preferred_supplier_id: int | None = None,
    lead_time_days: int | None = None,
    is_active: bool | None = None,
) -> InventoryPolicy:
    row = await get_policy(db, branch_id=branch_id, product_id=product_id)
    now = datetime.now(UTC)
    if row:
        if reorder_point is not None:
            row.reorder_point = reorder_point
        if reorder_qty is not None:
            row.reorder_qty = reorder_qty
        if preferred_supplier_id is not None:
            row.preferred_supplier_id = preferred_supplier_id
        if lead_time_days is not None:
            row.lead_time_days = lead_time_days
        if is_active is not None:
            row.is_active = is_active
        row.updated_at = now
        await db.flush()
        await db.refresh(row)
        return row

    row = InventoryPolicy(
        branch_id=branch_id,
        product_id=product_id,
        reorder_point=reorder_point if reorder_point is not None else 0,
        reorder_qty=reorder_qty if reorder_qty is not None else 0,
        preferred_supplier_id=preferred_supplier_id,
        lead_time_days=lead_time_days,
        is_active=is_active if is_active is not None else True,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


def default_policy_read(*, branch_id: int, product_id: int) -> InventoryPolicyRead:
    """Synthetic policy when no branch+product row exists yet."""
    return InventoryPolicyRead(
        id=0,
        branch_id=branch_id,
        product_id=product_id,
        reorder_point=0,
        reorder_qty=0,
        preferred_supplier_id=None,
        lead_time_days=None,
        is_active=True,
        is_custom_policy=False,
    )


def policy_to_read(row: InventoryPolicy) -> InventoryPolicyRead:
    return InventoryPolicyRead.model_validate(row).model_copy(update={"is_custom_policy": True})


async def require_policy(db: AsyncSession, *, branch_id: int, product_id: int) -> InventoryPolicy:
    row = await get_policy(db, branch_id=branch_id, product_id=product_id)
    if not row:
        raise NotFoundError(
            "Inventory policy not found",
            details={"branch_id": branch_id, "product_id": product_id},
        )
    return row
