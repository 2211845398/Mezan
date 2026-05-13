"""Transfer batches: dispatch/in-transit/received with stock updates (Epic 2)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError, StateTransitionError, ValidationError
from app.models.stock_level import StockLevel
from app.models.transfer_batch import TransferBatch
from app.models.transfer_line import TransferLine
from app.services.branch_scope import require_branch_open_for_operations
from app.services.catalog_service import resolve_default_variant_id
from app.services.document_posting_service import post_transfer_batch_receive_gl
from app.services.inventory_service import apply_stock_movement
from app.services.inventory_valuation_service import (
    apply_receipt_to_weighted_average,
    get_unit_cost_for_sale,
)


async def _get_batch(db: AsyncSession, batch_id: int) -> TransferBatch:
    res = await db.execute(
        select(TransferBatch)
        .options(selectinload(TransferBatch.lines))
        .where(TransferBatch.id == batch_id)
    )
    batch = res.scalar_one_or_none()
    if not batch:
        raise NotFoundError("Transfer batch not found", details={"batch_id": batch_id})
    return batch


async def create_batch(
    db: AsyncSession,
    *,
    created_by_user_id: int | None,
    data: dict[str, Any],
) -> TransferBatch:
    lines = data.pop("lines", [])
    if data["from_branch_id"] == data["to_branch_id"]:
        raise ValidationError("from_branch_id and to_branch_id must be different")
    if not lines:
        raise ValidationError("Transfer batch requires at least one line")
    await require_branch_open_for_operations(db, data["from_branch_id"])
    await require_branch_open_for_operations(db, data["to_branch_id"])
    batch = TransferBatch(**data, created_by_user_id=created_by_user_id, status="pending_dispatch")
    db.add(batch)
    await db.flush()
    for ln in lines:
        row = dict(ln)
        if not row.get("variant_id"):
            row["variant_id"] = await resolve_default_variant_id(db, product_id=row["product_id"])
        line_obj = TransferLine(**row, transfer_batch_id=batch.id)
        db.add(line_obj)
    await db.commit()
    return await _get_batch(db, batch.id)


async def list_batches(
    db: AsyncSession, *, limit: int = 50, offset: int = 0
) -> list[TransferBatch]:
    res = await db.execute(
        select(TransferBatch)
        .options(selectinload(TransferBatch.lines))
        .order_by(TransferBatch.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(res.scalars().all())


async def get_batch(db: AsyncSession, batch_id: int) -> TransferBatch:
    return await _get_batch(db, batch_id)


async def dispatch_batch(db: AsyncSession, *, batch_id: int) -> TransferBatch:
    batch = await _get_batch(db, batch_id)
    if batch.status != "pending_dispatch":
        raise StateTransitionError(
            "Batch must be pending_dispatch to dispatch",
            details={"current_status": batch.status},
        )
    if not batch.lines:
        raise ValidationError("Batch has no lines")

    # Deduct from source location (warehouse) once.
    for i, ln in enumerate(batch.lines):
        await apply_stock_movement(
            db,
            idempotency_key=f"transfer:{batch.id}:dispatch:{i}",
            branch_id=batch.from_branch_id,
            product_id=ln.product_id,
            qty_delta=-ln.qty,
            reason="transfer_dispatch",
            ref_type="transfer_batch",
            ref_id=str(batch.id),
            variant_id=ln.variant_id,
        )

    batch.status = "in_transit"
    batch.dispatched_at = datetime.now(UTC)
    await db.commit()
    return await _get_batch(db, batch.id)


async def receive_batch(db: AsyncSession, *, batch_id: int) -> TransferBatch:
    batch = await _get_batch(db, batch_id)
    if batch.status != "in_transit":
        raise StateTransitionError(
            "Batch must be in_transit to receive",
            details={"current_status": batch.status},
        )
    for i, ln in enumerate(batch.lines):
        unit_cost = await get_unit_cost_for_sale(
            db, branch_id=batch.from_branch_id, product_id=ln.product_id
        )
        sl_res = await db.execute(
            select(StockLevel.on_hand).where(
                and_(
                    StockLevel.branch_id == batch.to_branch_id,
                    StockLevel.product_id == ln.product_id,
                )
            )
        )
        qty_on_hand_before = int(sl_res.scalar_one_or_none() or 0)
        await apply_stock_movement(
            db,
            idempotency_key=f"transfer:{batch.id}:receive:{i}",
            branch_id=batch.to_branch_id,
            product_id=ln.product_id,
            qty_delta=ln.qty,
            reason="transfer_receive",
            ref_type="transfer_batch",
            ref_id=str(batch.id),
            variant_id=ln.variant_id,
        )
        await apply_receipt_to_weighted_average(
            db,
            branch_id=batch.to_branch_id,
            product_id=ln.product_id,
            qty_in=ln.qty,
            unit_cost=unit_cost,
            qty_on_hand_before=qty_on_hand_before,
        )

    batch.status = "received"
    batch.received_at = datetime.now(UTC)
    await post_transfer_batch_receive_gl(db, batch=batch)
    await db.commit()
    return await _get_batch(db, batch.id)
