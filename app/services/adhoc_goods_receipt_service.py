"""Receive goods without a purchase order (adhoc receipt)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found_error, validation_error
from app.models.suppliers import Supplier
from app.services.branch_scope import require_branch_open_for_operations
from app.services.catalog_service import resolve_default_variant_id
from app.services.inventory_human_movement_service import apply_human_inventory_movement
from app.services.product_uom_service import convert_product_unit_cost_to_base
from app.services.purchase_order_service import validate_variant_belongs_to_product


async def receive_adhoc_goods(
    db: AsyncSession,
    *,
    user_id: int,
    idempotency_key: str,
    branch_id: int,
    lines: list[dict[str, Any]],
    supplier_id: int | None = None,
    notes: str | None = None,
) -> list[int]:
    if not lines:
        validation_error("receipt_no_lines_required", "At least one receipt line is required")
    await require_branch_open_for_operations(db, branch_id)
    if supplier_id is not None:
        sup = await db.get(Supplier, supplier_id)
        if sup is None:
            not_found_error("supplier_not_found", "Supplier not found", supplier_id=supplier_id)

    header_note = (notes or "").strip()
    if supplier_id is not None:
        sup_label = f"supplier_id={supplier_id}"
        header_note = f"{header_note} | {sup_label}".strip(" |")

    movement_ids: list[int] = []
    for i, raw in enumerate(lines):
        product_id = int(raw["product_id"])
        qty = int(raw["qty"])
        uom_id = int(raw["uom_id"])
        unit_cost_line = Decimal(str(raw["unit_cost"]))
        unit_cost = await convert_product_unit_cost_to_base(
            db,
            product_id=product_id,
            uom_id=uom_id,
            unit_cost=unit_cost_line,
        )
        pick_vid = raw.get("variant_id")
        variant_id: int | None
        if pick_vid is not None:
            vid = int(pick_vid)
            await validate_variant_belongs_to_product(db, product_id=product_id, variant_id=vid)
            variant_id = vid
        else:
            variant_id = await resolve_default_variant_id(db, product_id=product_id)

        line_key = f"{idempotency_key}:line:{i}"
        mv = await apply_human_inventory_movement(
            db,
            user_id=user_id,
            idempotency_key=line_key,
            branch_id=branch_id,
            product_id=product_id,
            variant_id=variant_id,
            uom_id=uom_id,
            transaction_type="add_stock",
            quantity=qty,
            unit_cost=unit_cost,
            notes=header_note or None,
            reason="adhoc_receipt",
        )
        movement_ids.append(mv.id)
    return movement_ids
