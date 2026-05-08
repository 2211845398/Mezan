"""Structured human inventory movements (reserve, damage buckets, etc.)."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.services.inventory_service import apply_stock_movement_extended
from app.services.inventory_valuation_service import apply_receipt_to_weighted_average

TransactionType = Literal[
    "add_stock",
    "issue_stock",
    "return_stock",
    "damage_mark",
    "damage_scrap",
    "reserve",
    "release",
    "count_adjust",
]


async def apply_human_inventory_movement(
    db: AsyncSession,
    *,
    user_id: int,
    idempotency_key: str,
    branch_id: int,
    product_id: int,
    transaction_type: TransactionType,
    quantity: int | None = None,
    qty_signed: int | None = None,
    notes: str | None = None,
    reason: str = "manual_movement",
    unit_cost: Decimal | None = None,
) -> StockMovement:
    """Map a business transaction to stock level deltas + ledger row."""
    res = await db.execute(
        select(StockLevel).where(
            and_(StockLevel.branch_id == branch_id, StockLevel.product_id == product_id)
        )
    )
    level = res.scalar_one_or_none()
    oh = int(level.on_hand) if level else 0
    rv = int(level.reserved) if level else 0
    dm = int(level.damaged) if level else 0
    sellable = oh - rv - dm

    on_hand_delta = 0
    reserved_delta = 0
    damaged_delta = 0

    if transaction_type == "count_adjust":
        if qty_signed is None:
            raise ValidationError("qty_signed is required for count_adjust")
        if qty_signed == 0:
            raise ValidationError("qty_signed cannot be zero")
        on_hand_delta = int(qty_signed)
        q = abs(on_hand_delta)
    else:
        if quantity is None or quantity <= 0:
            raise ValidationError("quantity must be a positive integer")
        q = int(quantity)

    if transaction_type == "add_stock":
        on_hand_delta = q
    elif transaction_type == "issue_stock":
        if sellable < q:
            raise ValidationError("Insufficient sellable stock", details={"sellable": sellable, "requested": q})
        on_hand_delta = -q
    elif transaction_type == "return_stock":
        on_hand_delta = q
    elif transaction_type == "damage_mark":
        if sellable < q:
            raise ValidationError("Insufficient sellable stock to mark damaged", details={"sellable": sellable})
        damaged_delta = q
    elif transaction_type == "damage_scrap":
        if dm < q:
            raise ValidationError("Insufficient damaged stock to scrap", details={"damaged": dm})
        on_hand_delta = -q
        damaged_delta = -q
    elif transaction_type == "reserve":
        if sellable < q:
            raise ValidationError("Insufficient sellable stock to reserve", details={"sellable": sellable})
        reserved_delta = q
    elif transaction_type == "release":
        if rv < q:
            raise ValidationError("Insufficient reserved stock to release", details={"reserved": rv})
        reserved_delta = -q
    elif transaction_type == "count_adjust":
        pass
    else:
        raise ValidationError("Unknown transaction_type", details={"transaction_type": transaction_type})

    movement = await apply_stock_movement_extended(
        db,
        idempotency_key=idempotency_key,
        branch_id=branch_id,
        product_id=product_id,
        on_hand_delta=on_hand_delta,
        reserved_delta=reserved_delta,
        damaged_delta=damaged_delta,
        reason=reason,
        ref_type="human_inventory",
        ref_id=str(user_id),
        movement_kind=transaction_type,
        notes=notes,
        user_id=user_id,
    )
    if transaction_type == "add_stock":
        if unit_cost is None or unit_cost <= 0:
            raise ValidationError("unit_cost is required and must be positive for add_stock")
        await apply_receipt_to_weighted_average(
            db,
            branch_id=branch_id,
            product_id=product_id,
            qty_in=q,
            unit_cost=unit_cost,
            qty_on_hand_before=oh,
        )
    return movement
