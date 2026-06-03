"""List and release manual stock reservations."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found_error, validation_error
from app.models.branch import Branch
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_movement import StockMovement
from app.schemas.inventory_operations import ReservationRead
from app.services.inventory_human_movement_service import (
    _released_qty_for_reserve,
    apply_human_inventory_movement,
)
from app.utils.variant_display import variant_value_labels_summary


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
            StockMovement.movement_kind == "reserve",
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
    if reserve_mv is None or reserve_mv.movement_kind != "reserve":
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
