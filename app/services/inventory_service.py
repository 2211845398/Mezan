"""Inventory core operations (Epic 2): stock levels + movement ledger."""

from __future__ import annotations

from sqlalchemy import and_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, conflict_error, validation_error
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.services.catalog_service import resolve_default_variant_id


def _is_retryable_inventory_integrity_error(error: IntegrityError) -> bool:
    message = str(error.orig) if error.orig is not None else str(error)
    return any(
        constraint in message
        for constraint in (
            "uq_stock_movements_idempotency_key",
            "uq_stock_levels_branch_product",
            "uq_stock_levels_branch_product_variant",
        )
    )


def _validate_stock_level_invariants(level: StockLevel) -> None:
    if level.on_hand < 0 or level.reserved < 0 or level.damaged < 0:
        validation_error(
            "stock_levels_negative",
            "Stock levels cannot be negative",
            on_hand=level.on_hand,
            reserved=level.reserved,
            damaged=level.damaged,
        )
    if level.reserved + level.damaged > level.on_hand:
        validation_error(
            "stock_reserved_exceeds_on_hand",
            "reserved + damaged cannot exceed on_hand",
            on_hand=level.on_hand,
            reserved=level.reserved,
            damaged=level.damaged,
        )


async def apply_stock_movement_extended(
    db: AsyncSession,
    *,
    idempotency_key: str,
    branch_id: int,
    product_id: int,
    on_hand_delta: int = 0,
    reserved_delta: int = 0,
    damaged_delta: int = 0,
    reason: str,
    ref_type: str | None = None,
    ref_id: str | None = None,
    variant_id: int | None = None,
    movement_kind: str | None = None,
    notes: str | None = None,
    user_id: int | None = None,
) -> StockMovement:
    if on_hand_delta == 0 and reserved_delta == 0 and damaged_delta == 0:
        validation_error(
            "stock_delta_zero",
            "At least one of on_hand_delta, reserved_delta, damaged_delta must be non-zero",
        )

    resolved_variant_id = (
        variant_id if variant_id is not None else await resolve_default_variant_id(db, product_id=product_id)
    )

    for attempt in range(2):
        existing = await db.execute(
            select(StockMovement).where(StockMovement.idempotency_key == idempotency_key)
        )
        movement = existing.scalar_one_or_none()
        if movement:
            return movement

        try:
            async with db.begin_nested():
                res = await db.execute(
                    select(StockLevel).where(
                        and_(
                            StockLevel.branch_id == branch_id,
                            StockLevel.product_id == product_id,
                            StockLevel.variant_id == resolved_variant_id,
                        )
                    )
                )
                level = res.scalar_one_or_none()
                if not level:
                    level = StockLevel(
                        branch_id=branch_id,
                        product_id=product_id,
                        variant_id=resolved_variant_id,
                        on_hand=0,
                        reserved=0,
                        damaged=0,
                    )
                    db.add(level)
                    await db.flush()

                expected_version = level.version
                stmt = (
                    update(StockLevel)
                    .where(
                        and_(
                            StockLevel.id == level.id,
                            StockLevel.version == expected_version,
                        )
                    )
                    .values(
                        on_hand=StockLevel.on_hand + on_hand_delta,
                        reserved=StockLevel.reserved + reserved_delta,
                        damaged=StockLevel.damaged + damaged_delta,
                        version=StockLevel.version + 1,
                    )
                    .returning(StockLevel.id)
                )
                upd = await db.execute(stmt)
                if upd.scalar_one_or_none() is None:
                    conflict_error(
                        "stock_update_conflict",
                        "Stock update conflict",
                        branch_id=branch_id,
                        product_id=product_id,
                        variant_id=resolved_variant_id,
                    )

                chk = await db.execute(select(StockLevel).where(StockLevel.id == level.id))
                updated = chk.scalar_one()
                _validate_stock_level_invariants(updated)

                movement = StockMovement(
                    idempotency_key=idempotency_key,
                    branch_id=branch_id,
                    product_id=product_id,
                    variant_id=resolved_variant_id,
                    qty_delta=on_hand_delta,
                    reason=reason,
                    ref_type=ref_type,
                    ref_id=ref_id,
                    movement_kind=movement_kind,
                    notes=notes,
                    user_id=user_id,
                    reserved_delta=reserved_delta if reserved_delta != 0 else None,
                    damaged_delta=damaged_delta if damaged_delta != 0 else None,
                )
                db.add(movement)
                await db.flush()
        except IntegrityError as e:
            if not _is_retryable_inventory_integrity_error(e):
                raise
            existing = await db.execute(
                select(StockMovement).where(StockMovement.idempotency_key == idempotency_key)
            )
            movement = existing.scalar_one_or_none()
            if movement:
                return movement
            if attempt == 0:
                continue
            raise ConflictError(
                "Inventory movement conflict",
                details={"code": "inventory_movement_conflict"},
            ) from e

        await db.refresh(movement)
        return movement

    conflict_error("inventory_movement_conflict", "Inventory movement conflict")


async def apply_stock_movement(
    db: AsyncSession,
    *,
    idempotency_key: str,
    branch_id: int,
    product_id: int,
    qty_delta: int,
    reason: str,
    ref_type: str | None = None,
    ref_id: str | None = None,
    variant_id: int | None = None,
) -> StockMovement:
    if qty_delta == 0:
        validation_error("qty_delta_zero", "qty_delta cannot be zero")
    return await apply_stock_movement_extended(
        db,
        idempotency_key=idempotency_key,
        branch_id=branch_id,
        product_id=product_id,
        on_hand_delta=qty_delta,
        reserved_delta=0,
        damaged_delta=0,
        reason=reason,
        ref_type=ref_type,
        ref_id=ref_id,
        variant_id=variant_id,
        movement_kind=None,
        notes=None,
        user_id=None,
    )
