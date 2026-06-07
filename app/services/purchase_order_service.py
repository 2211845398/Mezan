"""Purchase order service with a strict state machine (Epic 2 + W-5.4)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ConflictError, NotFoundError, StateTransitionError, ValidationError
from app.models.branch import Branch
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.suppliers import Supplier
from app.schemas.purchase_orders import PurchaseOrderLineRead, PurchaseOrderRead
from app.services.branch_scope import require_warehouse_branch_for_purchasing
from app.services.product_uom_service import (
    convert_product_qty_to_base,
    get_product_base_uom_id,
    uom_map_for_ids,
    validate_po_line_uom,
)
from app.utils.person_name import display_person_name

TERMINAL_STATUSES = frozenset({"closed", "cancelled"})


async def validate_variant_belongs_to_product(
    db: AsyncSession, *, product_id: int, variant_id: int
) -> int:
    res = await db.execute(
        select(ProductVariant, Product.status)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(ProductVariant.id == variant_id)
    )
    row = res.one_or_none()
    if row is None:
        raise ValidationError("Unknown variant_id", details={"variant_id": variant_id})
    pv, product_status = row
    if int(pv.product_id) != int(product_id):
        raise ValidationError(
            "variant_id does not belong to product_id",
            details={"variant_id": variant_id, "product_id": product_id},
        )
    if product_status != "active":
        raise ValidationError(
            "Product is not active",
            details={"product_id": product_id, "variant_id": variant_id},
        )
    if not bool(pv.active):
        raise ValidationError(
            "Variant is archived or inactive",
            details={"variant_id": variant_id, "product_id": product_id},
        )
    return int(variant_id)


async def resolve_po_line_variant_id(
    db: AsyncSession, *, product_id: int, variant_id: int | None
) -> int | None:
    """PO lines without variant_id defer variant selection to goods receipt."""
    if variant_id is None:
        return None
    return await validate_variant_belongs_to_product(
        db, product_id=product_id, variant_id=variant_id
    )


async def _get_po(db: AsyncSession, po_id: int) -> PurchaseOrder:
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.id == po_id)
    )
    po = result.scalar_one_or_none()
    if not po:
        raise NotFoundError("Purchase order not found", details={"po_id": po_id})
    return po


async def load_purchase_order(db: AsyncSession, po_id: int) -> PurchaseOrder:
    """Load PO with lines eagerly (required before Pydantic from_attributes in async)."""
    return await _get_po(db, po_id)


async def _ensure_products_exist(db: AsyncSession, product_ids: set[int]) -> None:
    if not product_ids:
        return
    result = await db.execute(select(Product.id).where(Product.id.in_(product_ids)))
    found = {pid for (pid,) in result.all()}
    missing = sorted(product_ids - found)
    if missing:
        raise ValidationError(
            "Unknown products in PO lines", details={"missing_product_ids": missing}
        )


async def branch_names_by_id(db: AsyncSession, branch_ids: set[int]) -> dict[int, str]:
    if not branch_ids:
        return {}
    result = await db.execute(select(Branch.id, Branch.name).where(Branch.id.in_(branch_ids)))
    return {int(bid): str(name) for bid, name in result.all()}


def _po_lines_to_read(po: PurchaseOrder, uom_by_id: dict[int, Any]) -> list[PurchaseOrderLineRead]:
    lines: list[PurchaseOrderLineRead] = []
    for ln in po.lines:
        uom = uom_by_id.get(int(ln.uom_id))
        lines.append(
            PurchaseOrderLineRead.model_validate(ln).model_copy(
                update={
                    "uom_name": uom.name if uom else "",
                    "uom_symbol": uom.symbol if uom else "",
                }
            )
        )
    return lines


def purchase_order_to_read(
    po: PurchaseOrder,
    *,
    branch_name: str | None = None,
    uom_by_id: dict[int, Any] | None = None,
) -> PurchaseOrderRead:
    umap = uom_by_id or {}
    base = PurchaseOrderRead.model_validate(po).model_copy(
        update={
            "branch_name": branch_name,
            "lines": _po_lines_to_read(po, umap) if po.lines else [],
        }
    )
    return base


async def purchase_orders_to_read(
    db: AsyncSession, rows: list[PurchaseOrder]
) -> list[PurchaseOrderRead]:
    branch_ids = {int(r.branch_id) for r in rows if r.branch_id is not None}
    bmap = await branch_names_by_id(db, branch_ids)
    uom_ids: set[int] = set()
    for r in rows:
        for ln in r.lines:
            uom_ids.add(int(ln.uom_id))
    umap = await uom_map_for_ids(db, uom_ids)
    return [
        purchase_order_to_read(
            r,
            branch_name=bmap.get(int(r.branch_id)) if r.branch_id is not None else None,
            uom_by_id=umap,
        )
        for r in rows
    ]


async def purchase_order_to_read_one(db: AsyncSession, po: PurchaseOrder) -> PurchaseOrderRead:
    branch_name: str | None = None
    if po.branch_id is not None:
        bmap = await branch_names_by_id(db, {int(po.branch_id)})
        branch_name = bmap.get(int(po.branch_id))
    uom_ids = {int(ln.uom_id) for ln in po.lines}
    umap = await uom_map_for_ids(db, uom_ids)
    return purchase_order_to_read(po, branch_name=branch_name, uom_by_id=umap)


async def _resolve_supplier_name(db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    supplier_id = data.get("supplier_id")
    if supplier_id is not None:
        res = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
        sup = res.scalar_one_or_none()
        if not sup:
            raise ValidationError("Unknown supplier_id", details={"supplier_id": supplier_id})
        data["supplier_name"] = (
            display_person_name(sup.first_name, sup.father_name, sup.family_name).strip()
            or sup.code
        )
    elif not (data.get("supplier_name") or "").strip():
        raise ValidationError("supplier_id is required")
    return data


async def _normalize_po_line_row(db: AsyncSession, row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    if out.get("unit_cost") is None:
        out.pop("unit_cost", None)
    product_id = int(out["product_id"])
    qty = int(out["qty"])
    uom_id = out.get("uom_id")
    if uom_id is None:
        uom_id = await get_product_base_uom_id(db, product_id)
    else:
        uom_id = int(uom_id)
    await validate_po_line_uom(db, product_id=product_id, uom_id=uom_id)
    out["uom_id"] = uom_id
    out["qty_base"] = await convert_product_qty_to_base(
        db, product_id=product_id, uom_id=uom_id, qty=qty
    )
    return out


def _ensure_status(po: PurchaseOrder, expected: str) -> None:
    if po.status != expected:
        raise StateTransitionError(
            f"PO must be in '{expected}' status",
            details={"current_status": po.status, "expected_status": expected},
        )


async def _validate_po_branch_id(db: AsyncSession, branch_id: int | None) -> None:
    if branch_id is not None:
        await require_warehouse_branch_for_purchasing(db, int(branch_id))


async def create_po(
    db: AsyncSession,
    *,
    created_by_user_id: int | None,
    data: dict[str, Any],
) -> PurchaseOrder:
    lines = data.pop("lines", [])
    data = await _resolve_supplier_name(db, data)
    await _validate_po_branch_id(db, data.get("branch_id"))
    po = PurchaseOrder(**data, status="draft", created_by_user_id=created_by_user_id)
    db.add(po)
    await db.flush()

    product_ids = {ln["product_id"] for ln in lines}
    await _ensure_products_exist(db, product_ids)
    for ln in lines:
        row = await _normalize_po_line_row(db, dict(ln))
        row["variant_id"] = await resolve_po_line_variant_id(
            db, product_id=row["product_id"], variant_id=row.get("variant_id")
        )
        db.add(PurchaseOrderLine(purchase_order_id=po.id, **row))

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Purchase order conflicts with existing data") from e
    await db.refresh(po)
    return await _get_po(db, po.id)


async def count_pos(db: AsyncSession, *, status: str | None = None) -> int:
    q = select(func.count()).select_from(PurchaseOrder)
    if status is not None:
        q = q.where(PurchaseOrder.status == status)
    return int(await db.scalar(q) or 0)


async def list_pos(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
) -> list[PurchaseOrder]:
    from app.schemas.pagination import clamp_pagination

    limit, offset = clamp_pagination(limit, offset)
    q = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .order_by(PurchaseOrder.id.desc())
        .limit(limit)
        .offset(offset)
    )
    if status is not None:
        q = q.where(PurchaseOrder.status == status)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_po(db: AsyncSession, po_id: int) -> PurchaseOrder:
    return await _get_po(db, po_id)


async def update_po(db: AsyncSession, *, po_id: int, data: dict[str, Any]) -> PurchaseOrder:
    po = await _get_po(db, po_id)
    _ensure_status(po, "draft")

    data.pop("send_idempotency_key", None)
    lines = data.pop("lines", None)
    if data:
        data = await _resolve_supplier_name(db, data)
        if "branch_id" in data:
            await _validate_po_branch_id(db, data.get("branch_id"))
        for k, v in data.items():
            setattr(po, k, v)

    if lines is not None:
        product_ids = {ln["product_id"] for ln in lines}
        await _ensure_products_exist(db, product_ids)
        po.lines.clear()
        await db.flush()
        for ln in lines:
            row = await _normalize_po_line_row(db, dict(ln))
            row["variant_id"] = await resolve_po_line_variant_id(
                db, product_id=row["product_id"], variant_id=row.get("variant_id")
            )
            po.lines.append(PurchaseOrderLine(**row))

    await db.commit()
    return await _get_po(db, po.id)


async def mark_po_sent(
    db: AsyncSession,
    *,
    po_id: int,
    idempotency_key: str | None = None,
) -> PurchaseOrder:
    po = await _get_po(db, po_id)
    if po.status == "sent":
        if idempotency_key and po.send_idempotency_key == idempotency_key:
            return po
        raise ValidationError(
            "Purchase order already sent",
            details={"po_id": po_id},
        )
    if po.status in TERMINAL_STATUSES:
        raise StateTransitionError(
            "PO is in a terminal status",
            details={"current_status": po.status},
        )
    _ensure_status(po, "draft")
    if not po.lines:
        raise ValidationError("Cannot send a PO with no lines")
    po.status = "sent"
    po.sent_at = datetime.now(UTC)
    if idempotency_key:
        po.send_idempotency_key = idempotency_key
    await db.commit()
    return await _get_po(db, po.id)


async def mark_po_tracked(db: AsyncSession, *, po_id: int) -> PurchaseOrder:
    po = await _get_po(db, po_id)
    if po.status in TERMINAL_STATUSES:
        raise StateTransitionError(
            "PO is in a terminal status",
            details={"current_status": po.status},
        )
    if po.status not in {"sent", "tracked"}:
        raise StateTransitionError(
            "PO must be sent before tracking",
            details={"current_status": po.status, "expected_status": "sent"},
        )
    po.status = "tracked"
    await db.commit()
    return await _get_po(db, po.id)


async def mark_po_cancelled(db: AsyncSession, *, po_id: int) -> PurchaseOrder:
    po = await _get_po(db, po_id)
    _ensure_status(po, "draft")
    po.status = "cancelled"
    await db.commit()
    return await _get_po(db, po.id)


async def mark_po_closed(db: AsyncSession, *, po_id: int) -> PurchaseOrder:
    po = await _get_po(db, po_id)
    if po.status in TERMINAL_STATUSES:
        raise StateTransitionError(
            "PO is already closed or cancelled",
            details={"current_status": po.status},
        )
    if po.status not in {"sent", "tracked"}:
        raise StateTransitionError(
            "Only sent or tracked POs can be closed",
            details={"current_status": po.status},
        )
    po.status = "closed"
    await db.commit()
    return await _get_po(db, po.id)
