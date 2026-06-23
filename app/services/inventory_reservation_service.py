"""List and release manual stock reservations."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found_error, validation_error
from app.models.branch import Branch
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_movement import StockMovement
from app.models.transfer_batch import TransferBatch
from app.schemas.inventory_operations import ReservationRead
from app.services.inventory_human_movement_service import (
    _released_qty_for_reserve,
    apply_human_inventory_movement,
)
from app.utils.variant_display import variant_value_labels_summary


def _transfer_batch_id(mv: StockMovement) -> int | None:
    if mv.ref_type != "transfer_batch" or not mv.ref_id:
        return None
    try:
        return int(mv.ref_id)
    except (TypeError, ValueError):
        return None


async def list_open_reservations(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    limit: int = 100,
) -> list[ReservationRead]:
    stmt = (
        select(StockMovement, Branch.name, Product.name, ProductVariant)
        .join(Branch, Branch.id == StockMovement.branch_id)
        .join(Product, Product.id == StockMovement.product_id)
        .join(ProductVariant, ProductVariant.id == StockMovement.variant_id)
        .where(
            StockMovement.movement_kind.in_(["reserve", "transfer_reserve"]),
            StockMovement.reserved_delta.isnot(None),
            StockMovement.reserved_delta > 0,
        )
        .order_by(StockMovement.id.desc())
        .limit(limit)
    )
    if branch_id is not None:
        stmt = stmt.where(StockMovement.branch_id == branch_id)

    res = await db.execute(stmt)
    out: list[ReservationRead] = []
    for mv, branch_name, product_name, pv in res.all():
        reserved = int(mv.reserved_delta or 0)
        kind = (mv.movement_kind or "").strip()
        transfer_batch_id = _transfer_batch_id(mv)
        releasable = kind == "reserve"

        if kind == "transfer_reserve":
            if transfer_batch_id is None:
                continue
            batch = await db.get(TransferBatch, transfer_batch_id)
            if batch is None or batch.status != "pending_dispatch":
                continue
            released = 0
            open_qty = reserved
        else:
            released = await _released_qty_for_reserve(db, reserve_movement_id=mv.id)
            open_qty = reserved - released

        if open_qty <= 0:
            continue
        ref = (pv.reference_code or "").strip()
        out.append(
            ReservationRead(
                movement_id=mv.id,
                branch_id=mv.branch_id,
                branch_name=str(branch_name),
                product_id=mv.product_id,
                product_name=str(product_name),
                variant_id=mv.variant_id,
                variant_name=variant_value_labels_summary(pv.attribute_values) or str(product_name),
                reference_code=ref,
                qty_reserved=reserved,
                qty_released=released,
                qty_open=open_qty,
                created_at=mv.created_at.isoformat(),
                notes=mv.notes,
                movement_kind=kind,
                ref_type=mv.ref_type,
                ref_id=mv.ref_id,
                transfer_batch_id=transfer_batch_id,
                releasable=releasable,
            )
        )
    return out


async def release_reservation(
    db: AsyncSession,
    *,
    user_id: int,
    reserve_movement_id: int,
    idempotency_key: str,
    quantity: int,
    notes: str | None = None,
) -> StockMovement:
    reserve_mv = await db.get(StockMovement, reserve_movement_id)
    if reserve_mv is None:
        not_found_error(
            "reserve_movement_not_found",
            "Reserve movement not found",
            reserve_movement_id=reserve_movement_id,
        )
    if reserve_mv.movement_kind == "transfer_reserve":
        validation_error(
            "transfer_reserve_not_releasable",
            "Transfer reservations cannot be released here; cancel or dispatch the transfer batch",
            transfer_batch_id=_transfer_batch_id(reserve_mv),
        )
    if reserve_mv.movement_kind != "reserve":
        not_found_error(
            "reserve_movement_not_found",
            "Reserve movement not found",
            reserve_movement_id=reserve_movement_id,
        )
    reserved = int(reserve_mv.reserved_delta or 0)
    released = await _released_qty_for_reserve(db, reserve_movement_id=reserve_movement_id)
    if quantity > reserved - released:
        validation_error(
            "release_qty_exceeds_open",
            "Cannot release more than open reserved quantity",
            open=reserved - released,
            requested=quantity,
        )
    return await apply_human_inventory_movement(
        db,
        user_id=user_id,
        idempotency_key=idempotency_key,
        branch_id=reserve_mv.branch_id,
        product_id=reserve_mv.product_id,
        variant_id=reserve_mv.variant_id,
        transaction_type="release",
        quantity=quantity,
        reserve_movement_id=reserve_movement_id,
        notes=notes,
        reason="reserve_release",
    )
