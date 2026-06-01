"""Structured human inventory movements (reserve, damage buckets, etc.)."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found_error, validation_error
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.services.catalog_service import resolve_default_variant_id
from app.services.inventory_service import apply_stock_movement_extended
from app.services.inventory_valuation_service import apply_receipt_to_weighted_average
from app.services.product_uom_service import convert_product_qty_to_base, get_product_base_uom_id

TransactionType = Literal[
    "add_stock",
    "issue_stock",
    "return_stock",
    "damage_mark",
    "damage_scrap",
    "damage_unmark",
    "reserve",
    "release",
    "count_adjust",
]


async def _stock_level_for_variant(
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


async def _released_qty_for_reserve(db: AsyncSession, *, reserve_movement_id: int) -> int:
    res = await db.execute(
        select(func.coalesce(func.sum(-StockMovement.reserved_delta), 0)).where(
            StockMovement.movement_kind == "release",
            StockMovement.ref_type == "reserve_release",
            StockMovement.ref_id == str(reserve_movement_id),
        )
    )
    val = res.scalar()
    return int(val or 0)


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
    variant_id: int | None = None,
    uom_id: int | None = None,
    reserve_movement_id: int | None = None,
    notes: str | None = None,
    reason: str = "manual_movement",
    unit_cost: Decimal | None = None,
) -> StockMovement:
    """Map a business transaction to stock level deltas + ledger row."""
    resolved_variant_id = (
        variant_id if variant_id is not None else await resolve_default_variant_id(db, product_id=product_id)
    )
    level = await _stock_level_for_variant(
        db,
        branch_id=branch_id,
        product_id=product_id,
        variant_id=resolved_variant_id,
    )
    oh = int(level.on_hand) if level else 0
    rv = int(level.reserved) if level else 0
    dm = int(level.damaged) if level else 0
    sellable = oh - rv - dm

    on_hand_delta = 0
    reserved_delta = 0
    damaged_delta = 0
    ref_type = "human_inventory"
    ref_id = str(user_id)

    if transaction_type == "count_adjust":
        if qty_signed is None:
            validation_error("qty_signed_required_count_adjust", "qty_signed is required for count_adjust")
        if qty_signed == 0:
            validation_error("qty_signed_zero", "qty_signed cannot be zero")
        on_hand_delta = int(qty_signed)
        q = abs(on_hand_delta)
    elif transaction_type == "release":
        if reserve_movement_id is None:
            validation_error("reserve_movement_id_required", "reserve_movement_id is required for release")
        if quantity is None or quantity <= 0:
            validation_error("quantity_positive_required", "quantity must be a positive integer")
        q = int(quantity)
        reserve_mv = await db.get(StockMovement, reserve_movement_id)
        if reserve_mv is None or reserve_mv.movement_kind != "reserve":
            not_found_error(
                "reserve_movement_not_found",
                "Reserve movement not found",
                reserve_movement_id=reserve_movement_id,
            )
        if (
            reserve_mv.branch_id != branch_id
            or reserve_mv.product_id != product_id
            or reserve_mv.variant_id != resolved_variant_id
        ):
            validation_error(
                "release_branch_product_mismatch",
                "Release must match the reserved branch, product, and variant",
                reserve_movement_id=reserve_movement_id,
            )
        reserved_amt = int(reserve_mv.reserved_delta or 0)
        already = await _released_qty_for_reserve(db, reserve_movement_id=reserve_movement_id)
        open_qty = reserved_amt - already
        if q > open_qty:
            validation_error(
                "release_qty_exceeds_open",
                "Cannot release more than the open reserved quantity",
                open=open_qty,
                requested=q,
            )
        reserved_delta = -q
        ref_type = "reserve_release"
        ref_id = str(reserve_movement_id)
    else:
        if quantity is None or quantity <= 0:
            validation_error("quantity_positive_required", "quantity must be a positive integer")
        line_uom = uom_id if uom_id is not None else await get_product_base_uom_id(db, product_id)
        q = await convert_product_qty_to_base(
            db, product_id=product_id, uom_id=line_uom, qty=int(quantity)
        )

        if transaction_type == "add_stock":
            on_hand_delta = q
        elif transaction_type == "issue_stock":
            if sellable < q:
                validation_error(
                    "insufficient_sellable_stock",
                    "Insufficient sellable stock",
                    sellable=sellable,
                    requested=q,
                )
            on_hand_delta = -q
        elif transaction_type == "return_stock":
            on_hand_delta = q
        elif transaction_type == "damage_mark":
            if sellable < q:
                validation_error(
                    "insufficient_sellable_stock_damage_mark",
                    "Insufficient sellable stock to mark damaged",
                    sellable=sellable,
                )
            damaged_delta = q
        elif transaction_type == "damage_scrap":
            if dm < q:
                validation_error(
                    "insufficient_damaged_stock_scrap",
                    "Insufficient damaged stock to scrap",
                    damaged=dm,
                )
            on_hand_delta = -q
            damaged_delta = -q
        elif transaction_type == "damage_unmark":
            if dm < q:
                validation_error(
                    "insufficient_damaged_stock_unmark",
                    "Insufficient damaged stock to unmark",
                    damaged=dm,
                    requested=q,
                )
            damaged_delta = -q
        elif transaction_type == "reserve":
            if sellable < q:
                validation_error(
                    "insufficient_sellable_stock_reserve",
                    "Insufficient sellable stock to reserve",
                    sellable=sellable,
                )
            reserved_delta = q
        else:
            validation_error(
                "unknown_transaction_type",
                "Unknown transaction_type",
                transaction_type=transaction_type,
            )

    movement = await apply_stock_movement_extended(
        db,
        idempotency_key=idempotency_key,
        branch_id=branch_id,
        product_id=product_id,
        variant_id=resolved_variant_id,
        on_hand_delta=on_hand_delta,
        reserved_delta=reserved_delta,
        damaged_delta=damaged_delta,
        reason=reason,
        ref_type=ref_type,
        ref_id=ref_id,
        movement_kind=transaction_type,
        notes=notes,
        user_id=user_id,
    )
    if transaction_type == "add_stock":
        if unit_cost is None or unit_cost <= 0:
            validation_error(
                "unit_cost_required_add_stock",
                "unit_cost is required and must be positive for add_stock",
            )
        await apply_receipt_to_weighted_average(
            db,
            branch_id=branch_id,
            product_id=product_id,
            qty_in=q,
            unit_cost=unit_cost,
            qty_on_hand_before=oh,
            variant_id=resolved_variant_id,
        )
    return movement
