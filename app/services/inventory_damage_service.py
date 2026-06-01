"""List damaged stock positions and apply scrap / unmark actions."""

from __future__ import annotations

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import validation_error
from app.models.branch import Branch
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_level import StockLevel
from app.models.stock_movement import StockMovement
from app.schemas.inventory_operations import DamagedPositionRead
from app.services.inventory_human_movement_service import apply_human_inventory_movement
from app.utils.variant_display import variant_value_labels_summary


async def _latest_damage_mark(
    db: AsyncSession,
    *,
    branch_id: int,
    product_id: int,
    variant_id: int,
) -> StockMovement | None:
    res = await db.execute(
        select(StockMovement)
        .where(
            and_(
                StockMovement.branch_id == branch_id,
                StockMovement.product_id == product_id,
                StockMovement.variant_id == variant_id,
                StockMovement.movement_kind == "damage_mark",
            )
        )
        .order_by(StockMovement.id.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def list_damaged_positions(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    limit: int = 200,
) -> list[DamagedPositionRead]:
    stmt = (
        select(StockLevel, Branch.name, Product.name, ProductVariant)
        .join(Branch, Branch.id == StockLevel.branch_id)
        .join(Product, Product.id == StockLevel.product_id)
        .join(ProductVariant, ProductVariant.id == StockLevel.variant_id)
        .where(StockLevel.damaged > 0)
        .order_by(Branch.name.asc(), Product.name.asc(), ProductVariant.sku.asc())
        .limit(min(max(limit, 1), 500))
    )
    if branch_id is not None:
        stmt = stmt.where(StockLevel.branch_id == branch_id)

    res = await db.execute(stmt)
    out: list[DamagedPositionRead] = []
    for sl, branch_name, product_name, pv in res.all():
        ref = (pv.reference_code or "").strip()
        latest = await _latest_damage_mark(
            db,
            branch_id=sl.branch_id,
            product_id=sl.product_id,
            variant_id=sl.variant_id,
        )
        out.append(
            DamagedPositionRead(
                branch_id=sl.branch_id,
                branch_name=str(branch_name),
                product_id=sl.product_id,
                product_name=str(product_name),
                variant_id=sl.variant_id,
                variant_name=variant_value_labels_summary(pv.attribute_values) or str(product_name),
                reference_code=ref,
                qty_damaged=int(sl.damaged),
                movement_id=latest.id if latest else None,
                reason=latest.reason if latest else None,
            )
        )
    return out


async def scrap_damaged_position(
    db: AsyncSession,
    *,
    user_id: int,
    idempotency_key: str,
    branch_id: int,
    product_id: int,
    variant_id: int | None,
    quantity: int,
    uom_id: int | None = None,
    notes: str | None = None,
) -> StockMovement:
    if quantity <= 0:
        validation_error("quantity_positive_required", "quantity must be positive", quantity=quantity)
    return await apply_human_inventory_movement(
        db,
        user_id=user_id,
        idempotency_key=idempotency_key,
        branch_id=branch_id,
        product_id=product_id,
        variant_id=variant_id,
        uom_id=uom_id,
        transaction_type="damage_scrap",
        quantity=quantity,
        notes=notes,
        reason="damage_scrap",
    )


async def unmark_damaged_position(
    db: AsyncSession,
    *,
    user_id: int,
    idempotency_key: str,
    branch_id: int,
    product_id: int,
    variant_id: int | None,
    quantity: int,
    uom_id: int | None = None,
    notes: str | None = None,
) -> StockMovement:
    if quantity <= 0:
        validation_error("quantity_positive_required", "quantity must be positive", quantity=quantity)
    return await apply_human_inventory_movement(
        db,
        user_id=user_id,
        idempotency_key=idempotency_key,
        branch_id=branch_id,
        product_id=product_id,
        variant_id=variant_id,
        uom_id=uom_id,
        transaction_type="damage_unmark",
        quantity=quantity,
        notes=notes,
        reason="damage_unmark",
    )
