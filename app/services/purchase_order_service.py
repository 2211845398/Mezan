"""Purchase order service with a strict state machine (Epic 2 + W-5.4)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ConflictError, NotFoundError, StateTransitionError, ValidationError
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.services.catalog_service import resolve_default_variant_id

TERMINAL_STATUSES = frozenset({"closed", "cancelled"})


async def _line_variant_id(db: AsyncSession, *, product_id: int, variant_id: int | None) -> int:
    if variant_id is not None:
        res = await db.execute(
            select(ProductVariant.product_id).where(ProductVariant.id == variant_id)
        )
        pid = res.scalar_one_or_none()
        if pid is None:
            raise ValidationError("Unknown variant_id", details={"variant_id": variant_id})
        if int(pid) != int(product_id):
            raise ValidationError(
                "variant_id does not belong to product_id",
                details={"variant_id": variant_id, "product_id": product_id},
            )
        return int(variant_id)
    return await resolve_default_variant_id(db, product_id=product_id)


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


def _ensure_status(po: PurchaseOrder, expected: str) -> None:
    if po.status != expected:
        raise StateTransitionError(
            f"PO must be in '{expected}' status",
            details={"current_status": po.status, "expected_status": expected},
        )


async def create_po(
    db: AsyncSession,
    *,
    created_by_user_id: int | None,
    data: dict[str, Any],
) -> PurchaseOrder:
    lines = data.pop("lines", [])
    po = PurchaseOrder(**data, status="draft", created_by_user_id=created_by_user_id)
    db.add(po)
    await db.flush()

    product_ids = {ln["product_id"] for ln in lines}
    await _ensure_products_exist(db, product_ids)
    for ln in lines:
        row = dict(ln)
        row["variant_id"] = await _line_variant_id(
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


async def list_pos(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
) -> list[PurchaseOrder]:
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
    for k, v in data.items():
        setattr(po, k, v)

    if lines is not None:
        product_ids = {ln["product_id"] for ln in lines}
        await _ensure_products_exist(db, product_ids)
        po.lines.clear()
        await db.flush()
        for ln in lines:
            row = dict(ln)
            row["variant_id"] = await _line_variant_id(
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
