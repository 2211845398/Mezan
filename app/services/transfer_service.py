"""Transfer batches: dispatch/in-transit/received with stock updates (Epic 2)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import not_found_error, state_transition_error, validation_error
from app.models.product_variant import ProductVariant
from app.models.stock_level import StockLevel
from app.models.transfer_batch import TransferBatch
from app.models.transfer_line import TransferLine
from app.services.branch_scope import require_branch_open_for_operations
from app.services.catalog_service import resolve_default_variant_id
from app.services.document_posting_service import post_transfer_batch_receive_gl
from app.services.inventory_service import (
    apply_stock_movement,
    apply_stock_movement_extended,
)
from app.services.inventory_valuation_service import (
    apply_receipt_to_weighted_average,
    get_unit_cost_for_sale,
)
from app.services.product_uom_service import convert_product_qty_to_base, get_product_base_uom_id


async def _stock_level(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int,
) -> StockLevel | None:
    res = await db.execute(
        select(StockLevel).where(
            and_(
                StockLevel.branch_id == branch_id,
                StockLevel.product_id == product_id,
                StockLevel.variant_id == variant_id,
            )
        )
    )
    return res.scalar_one_or_none()


def _available_qty(level: StockLevel | None) -> int:
    if level is None:
        return 0
    return int(level.on_hand) - int(level.reserved) - int(level.damaged)


async def _assert_transfer_qty_available(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int,
    qty: int,
) -> None:
    if qty <= 0:
        validation_error(
            "transfer_qty_positive",
            "Transfer line qty must be positive",
            qty=qty,
        )
    level = await _stock_level(
        db, branch_id=branch_id, product_id=product_id, variant_id=variant_id
    )
    avail = _available_qty(level)
    if avail < qty:
        validation_error(
            "insufficient_transfer_stock",
            "Insufficient available stock at sending branch",
            branch_id=branch_id,
            product_id=product_id,
            variant_id=variant_id,
            requested=qty,
            available=avail,
        )


async def _assert_transfer_qty_reserved(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int,
    qty: int,
) -> None:
    """Dispatch consumes reserved stock, not free available qty."""
    if qty <= 0:
        validation_error(
            "transfer_qty_positive",
            "Transfer line qty must be positive",
            qty=qty,
        )
    level = await _stock_level(
        db, branch_id=branch_id, product_id=product_id, variant_id=variant_id
    )
    reserved = int(level.reserved) if level is not None else 0
    if reserved < qty:
        validation_error(
            "insufficient_transfer_reserved",
            "Insufficient reserved stock for transfer dispatch",
            branch_id=branch_id,
            product_id=product_id,
            variant_id=variant_id,
            requested=qty,
            reserved=reserved,
        )


async def _get_batch(db: AsyncSession, batch_id: int) -> TransferBatch:
    res = await db.execute(
        select(TransferBatch)
        .options(selectinload(TransferBatch.lines))
        .where(TransferBatch.id == batch_id)
    )
    batch = res.scalar_one_or_none()
    if not batch:
        not_found_error(
            "transfer_batch_not_found",
            "Transfer batch not found",
            batch_id=batch_id,
        )
    return batch


async def create_batch(
    db: AsyncSession,
    *,
    created_by_user_id: int | None,
    data: dict[str, Any],
) -> TransferBatch:
    lines = data.pop("lines", [])
    if data["from_branch_id"] == data["to_branch_id"]:
        validation_error(
            "transfer_same_branch",
            "from_branch_id and to_branch_id must be different",
        )
    if not lines:
        validation_error("transfer_no_lines", "Transfer batch requires at least one line")
    await require_branch_open_for_operations(db, data["from_branch_id"])
    await require_branch_open_for_operations(db, data["to_branch_id"])
    batch = TransferBatch(**data, created_by_user_id=created_by_user_id, status="pending_dispatch")
    db.add(batch)
    await db.flush()
    from_branch_id = int(data["from_branch_id"])
    resolved_lines = await _resolve_and_persist_transfer_lines(
        db,
        batch=batch,
        from_branch_id=from_branch_id,
        lines=lines,
    )
    await db.flush()
    await _apply_transfer_reservations(
        db,
        batch_id=batch.id,
        from_branch_id=from_branch_id,
        resolved_lines=resolved_lines,
        key_prefix="reserve",
    )
    await db.commit()
    return await _get_batch(db, batch.id)


async def _resolve_and_persist_transfer_lines(
    db: AsyncSession,
    *,
    batch: TransferBatch,
    from_branch_id: int,
    lines: list[Any],
) -> list[tuple[int, int, int]]:
    """Validate lines, persist TransferLine rows, return (product_id, variant_id, qty_base)."""
    resolved_lines: list[tuple[int, int, int]] = []
    for ln in lines:
        row = dict(ln)
        product_id = int(row["product_id"])
        qty = int(row["qty"])
        uom_id = row.get("uom_id")
        if uom_id is None:
            uom_id = await get_product_base_uom_id(db, product_id)
        else:
            uom_id = int(uom_id)
        qty_base = await convert_product_qty_to_base(
            db, product_id=product_id, uom_id=uom_id, qty=qty
        )
        pick_vid = row.get("variant_id")
        if pick_vid is not None:
            vid = int(pick_vid)
            chk = await db.execute(
                select(ProductVariant.id).where(
                    ProductVariant.id == vid,
                    ProductVariant.product_id == product_id,
                )
            )
            if chk.scalar_one_or_none() is None:
                validation_error(
                    "transfer_variant_product_mismatch",
                    "variant_id does not match product_id",
                    variant_id=vid,
                    product_id=product_id,
                )
            variant_id = vid
        else:
            variant_id = await resolve_default_variant_id(db, product_id=product_id)
        await _assert_transfer_qty_available(
            db,
            branch_id=from_branch_id,
            product_id=product_id,
            variant_id=variant_id,
            qty=qty_base,
        )
        db.add(
            TransferLine(
                transfer_batch_id=batch.id,
                product_id=product_id,
                variant_id=variant_id,
                qty=qty,
                uom_id=uom_id,
                qty_base=qty_base,
            )
        )
        resolved_lines.append((product_id, variant_id, qty_base))
    return resolved_lines


async def _apply_transfer_reservations(
    db: AsyncSession,
    *,
    batch_id: int,
    from_branch_id: int,
    resolved_lines: list[tuple[int, int, int]],
    key_prefix: str,
) -> None:
    for i, (product_id, variant_id, qty) in enumerate(resolved_lines):
        await apply_stock_movement_extended(
            db,
            idempotency_key=f"transfer:{batch_id}:{key_prefix}:{i}",
            branch_id=from_branch_id,
            product_id=product_id,
            variant_id=variant_id,
            reserved_delta=qty,
            reason="transfer_reserve",
            ref_type="transfer_batch",
            ref_id=str(batch_id),
            movement_kind="transfer_reserve",
        )


async def update_pending_batch(
    db: AsyncSession,
    *,
    batch_id: int,
    data: dict[str, Any],
) -> TransferBatch:
    batch = await _get_batch(db, batch_id)
    if batch.status != "pending_dispatch":
        state_transition_error(
            "transfer_update_not_pending",
            "Only pending_dispatch transfers can be updated",
            current_status=batch.status,
        )
    lines = data.pop("lines", [])
    from_branch_id = int(data["from_branch_id"])
    to_branch_id = int(data["to_branch_id"])
    if from_branch_id == to_branch_id:
        validation_error(
            "transfer_same_branch",
            "from_branch_id and to_branch_id must be different",
        )
    if not lines:
        validation_error("transfer_no_lines", "Transfer batch requires at least one line")
    await require_branch_open_for_operations(db, from_branch_id)
    await require_branch_open_for_operations(db, to_branch_id)

    old_from_branch_id = int(batch.from_branch_id)
    old_lines = list(batch.lines)
    for i, ln in enumerate(old_lines):
        await apply_stock_movement_extended(
            db,
            idempotency_key=f"transfer:{batch.id}:update_release:{i}",
            branch_id=old_from_branch_id,
            product_id=ln.product_id,
            variant_id=ln.variant_id,
            reserved_delta=-ln.qty_base,
            reason="transfer_update_release",
            ref_type="transfer_batch",
            ref_id=str(batch.id),
            movement_kind="transfer_update_release",
        )
    for ln in old_lines:
        await db.delete(ln)
    await db.flush()

    batch.from_branch_id = from_branch_id
    batch.to_branch_id = to_branch_id
    await db.flush()

    resolved_lines = await _resolve_and_persist_transfer_lines(
        db,
        batch=batch,
        from_branch_id=from_branch_id,
        lines=lines,
    )
    await db.flush()
    await _apply_transfer_reservations(
        db,
        batch_id=batch.id,
        from_branch_id=from_branch_id,
        resolved_lines=resolved_lines,
        key_prefix="update_reserve",
    )
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


async def dispatch_batch(
    db: AsyncSession,
    *,
    batch_id: int,
    actor_branch_id: int | None = None,
) -> TransferBatch:
    batch = await _get_batch(db, batch_id)
    if batch.status != "pending_dispatch":
        state_transition_error(
            "transfer_not_pending_dispatch",
            "Batch must be pending_dispatch to dispatch",
            current_status=batch.status,
        )
    if actor_branch_id is not None and actor_branch_id != batch.from_branch_id:
        validation_error(
            "transfer_dispatch_wrong_branch",
            "Dispatch must be performed at the sending branch",
            expected_branch_id=batch.from_branch_id,
            actor_branch_id=actor_branch_id,
        )
    if not batch.lines:
        validation_error("transfer_no_lines", "Batch has no lines")

    for i, ln in enumerate(batch.lines):
        await _assert_transfer_qty_reserved(
            db,
            branch_id=batch.from_branch_id,
            product_id=ln.product_id,
            variant_id=ln.variant_id,
            qty=ln.qty_base,
        )
        await apply_stock_movement_extended(
            db,
            idempotency_key=f"transfer:{batch.id}:dispatch:{i}",
            branch_id=batch.from_branch_id,
            product_id=ln.product_id,
            variant_id=ln.variant_id,
            on_hand_delta=-ln.qty_base,
            reserved_delta=-ln.qty_base,
            reason="transfer_dispatch",
            ref_type="transfer_batch",
            ref_id=str(batch.id),
            movement_kind="transfer_dispatch",
        )

    batch.status = "in_transit"
    batch.dispatched_at = datetime.now(UTC)
    await db.commit()
    return await _get_batch(db, batch.id)


async def receive_batch(
    db: AsyncSession,
    *,
    batch_id: int,
    actor_branch_id: int | None = None,
) -> TransferBatch:
    batch = await _get_batch(db, batch_id)
    if batch.status != "in_transit":
        state_transition_error(
            "transfer_not_in_transit",
            "Batch must be in_transit to receive",
            current_status=batch.status,
        )
    if actor_branch_id is not None and actor_branch_id != batch.to_branch_id:
        validation_error(
            "transfer_receive_wrong_branch",
            "Receipt must be performed at the receiving branch",
            expected_branch_id=batch.to_branch_id,
            actor_branch_id=actor_branch_id,
        )
    for i, ln in enumerate(batch.lines):
        unit_cost = await get_unit_cost_for_sale(
            db, branch_id=batch.from_branch_id, product_id=ln.product_id, variant_id=ln.variant_id
        )
        sl_res = await db.execute(
            select(StockLevel.on_hand).where(
                and_(
                    StockLevel.branch_id == batch.to_branch_id,
                    StockLevel.product_id == ln.product_id,
                    StockLevel.variant_id == ln.variant_id,
                )
            )
        )
        qty_on_hand_before = int(sl_res.scalar_one_or_none() or 0)
        await apply_stock_movement(
            db,
            idempotency_key=f"transfer:{batch.id}:receive:{i}",
            branch_id=batch.to_branch_id,
            product_id=ln.product_id,
            qty_delta=ln.qty_base,
            reason="transfer_receive",
            ref_type="transfer_batch",
            ref_id=str(batch.id),
            variant_id=ln.variant_id,
        )
        await apply_receipt_to_weighted_average(
            db,
            branch_id=batch.to_branch_id,
            product_id=ln.product_id,
            qty_in=ln.qty_base,
            unit_cost=unit_cost,
            qty_on_hand_before=qty_on_hand_before,
            variant_id=ln.variant_id,
        )

    batch.status = "received"
    batch.received_at = datetime.now(UTC)
    await post_transfer_batch_receive_gl(db, batch=batch)
    await db.commit()
    return await _get_batch(db, batch.id)


async def cancel_pending_batch(
    db: AsyncSession,
    *,
    batch_id: int,
    actor_branch_id: int | None = None,
) -> None:
    """Delete a transfer batch that has not been dispatched yet (no stock movement)."""
    batch = await _get_batch(db, batch_id)
    if batch.status != "pending_dispatch":
        state_transition_error(
            "transfer_cancel_not_pending",
            "Only pending_dispatch transfers can be cancelled",
            current_status=batch.status,
        )
    if actor_branch_id is not None and actor_branch_id != batch.from_branch_id:
        validation_error(
            "transfer_cancel_wrong_branch",
            "Cancellation must be performed at the sending branch",
            expected_branch_id=batch.from_branch_id,
            actor_branch_id=actor_branch_id,
        )
    for i, ln in enumerate(batch.lines):
        await apply_stock_movement_extended(
            db,
            idempotency_key=f"transfer:{batch.id}:cancel_reserve:{i}",
            branch_id=batch.from_branch_id,
            product_id=ln.product_id,
            variant_id=ln.variant_id,
            reserved_delta=-ln.qty_base,
            reason="transfer_cancel",
            ref_type="transfer_batch",
            ref_id=str(batch.id),
            movement_kind="transfer_cancel",
        )
    await db.delete(batch)
    await db.flush()
