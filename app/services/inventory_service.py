"""Inventory core operations (Epic 2): stock levels + movement ledger."""

from __future__ import annotations

from sqlalchemy import and_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ValidationError
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement


def _is_retryable_inventory_integrity_error(error: IntegrityError) -> bool:
    message = str(error.orig) if error.orig is not None else str(error)
    return any(
        constraint in message
        for constraint in (
            "uq_stock_movements_idempotency_key",
            "uq_stock_levels_branch_product",
        )
    )


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
) -> StockMovement:
    if qty_delta == 0:
        raise ValidationError("qty_delta cannot be zero")

    for attempt in range(2):
        # Idempotency: if movement exists, return it.
        existing = await db.execute(
            select(StockMovement).where(StockMovement.idempotency_key == idempotency_key)
        )
        movement = existing.scalar_one_or_none()
        if movement:
            return movement

        try:
            # Keep the stock update and movement insert in the same savepoint so
            # idempotency races cannot leave stock mutated without a ledger row.
            async with db.begin_nested():
                res = await db.execute(
                    select(StockLevel).where(
                        and_(StockLevel.branch_id == branch_id, StockLevel.product_id == product_id)
                    )
                )
                level = res.scalar_one_or_none()
                if not level:
                    level = StockLevel(
                        branch_id=branch_id,
                        product_id=product_id,
                        on_hand=0,
                        reserved=0,
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
                    .values(on_hand=StockLevel.on_hand + qty_delta, version=StockLevel.version + 1)
                    .returning(StockLevel.id)
                )
                upd = await db.execute(stmt)
                if upd.scalar_one_or_none() is None:
                    raise ConflictError(
                        "Stock update conflict",
                        details={"branch_id": branch_id, "product_id": product_id},
                    )

                movement = StockMovement(
                    idempotency_key=idempotency_key,
                    branch_id=branch_id,
                    product_id=product_id,
                    qty_delta=qty_delta,
                    reason=reason,
                    ref_type=ref_type,
                    ref_id=ref_id,
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
            raise ConflictError("Inventory movement conflict") from e

        await db.refresh(movement)
        return movement

    raise ConflictError("Inventory movement conflict")
