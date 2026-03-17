"""Purchase order service with a strict state machine (Epic 2)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ConflictError, NotFoundError, StateTransitionError, ValidationError
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine

ALLOWED_STATUSES = {"draft", "sent", "tracked"}


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
        raise ValidationError("Unknown products in PO lines", details={"missing_product_ids": missing})


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
        db.add(PurchaseOrderLine(purchase_order_id=po.id, **ln))

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise ConflictError("Purchase order conflicts with existing data") from e
    await db.refresh(po)
    return await _get_po(db, po.id)


async def list_pos(db: AsyncSession, *, limit: int = 50, offset: int = 0) -> list[PurchaseOrder]:
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .order_by(PurchaseOrder.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def get_po(db: AsyncSession, po_id: int) -> PurchaseOrder:
    return await _get_po(db, po_id)


async def update_po(db: AsyncSession, *, po_id: int, data: dict[str, Any]) -> PurchaseOrder:
    po = await _get_po(db, po_id)
    _ensure_status(po, "draft")

    lines = data.pop("lines", None)
    for k, v in data.items():
        setattr(po, k, v)

    if lines is not None:
        product_ids = {ln["product_id"] for ln in lines}
        await _ensure_products_exist(db, product_ids)
        po.lines.clear()
        await db.flush()
        for ln in lines:
            po.lines.append(PurchaseOrderLine(**ln))

    await db.commit()
    return await _get_po(db, po.id)


async def mark_po_sent(db: AsyncSession, *, po_id: int) -> PurchaseOrder:
    po = await _get_po(db, po_id)
    _ensure_status(po, "draft")
    if not po.lines:
        raise ValidationError("Cannot send a PO with no lines")
    po.status = "sent"
    po.sent_at = datetime.now(UTC)
    await db.commit()
    return await _get_po(db, po.id)


async def mark_po_tracked(db: AsyncSession, *, po_id: int) -> PurchaseOrder:
    po = await _get_po(db, po_id)
    if po.status not in {"sent", "tracked"}:
        raise StateTransitionError(
            "PO must be sent before tracking",
            details={"current_status": po.status, "expected_status": "sent"},
        )
    po.status = "tracked"
    await db.commit()
    return await _get_po(db, po.id)

