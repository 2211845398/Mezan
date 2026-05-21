"""Goods receipts API (W-5.4: PO-linked receiving)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_permission
from app.core.errors import NotFoundError
from app.db.database import get_db
from app.models.goods_receipt import GoodsReceipt
from app.models.users import User
from app.schemas.goods_receipts import (
    GoodsReceiptLineRead,
    GoodsReceiptRead,
    GoodsReceiptReceiveRequest,
)
from app.services import audit_service
from app.services.goods_receipt_service import receive_goods_for_purchase_order
from app.services.purchase_order_service import load_purchase_order, purchase_order_to_read_one

router = APIRouter()


def _receipt_read_schema(receipt: GoodsReceipt) -> GoodsReceiptRead:
    return GoodsReceiptRead(
        id=receipt.id,
        purchase_order_id=receipt.purchase_order_id,
        branch_id=receipt.branch_id,
        supplier_name=receipt.supplier_name,
        supplier_id=receipt.supplier_id,
        source_invoice_scan_id=receipt.source_invoice_scan_id,
        created_by_user_id=receipt.created_by_user_id,
        notes=receipt.notes,
        created_at=receipt.created_at,
        lines=[GoodsReceiptLineRead.model_validate(ln) for ln in receipt.lines],
    )


async def _load_receipt_with_lines(db: AsyncSession, receipt_id: int) -> GoodsReceipt:
    res = await db.execute(
        select(GoodsReceipt)
        .options(selectinload(GoodsReceipt.lines))
        .where(GoodsReceipt.id == receipt_id)
    )
    receipt = res.scalar_one_or_none()
    if not receipt:
        raise NotFoundError("Goods receipt not found", details={"goods_receipt_id": receipt_id})
    return receipt


@router.get("/goods-receipts", response_model=list[GoodsReceiptRead])
async def list_goods_receipts_endpoint(
    purchase_order_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("purchase_orders", "read"),
) -> list[GoodsReceiptRead]:
    res = await db.execute(
        select(GoodsReceipt)
        .options(selectinload(GoodsReceipt.lines))
        .where(GoodsReceipt.purchase_order_id == purchase_order_id)
        .order_by(GoodsReceipt.id.desc())
    )
    loaded = list(res.scalars().unique().all())
    return [_receipt_read_schema(r) for r in loaded]


@router.get("/goods-receipts/{receipt_id}", response_model=GoodsReceiptRead)
async def get_goods_receipt_endpoint(
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("purchase_orders", "read"),
) -> GoodsReceiptRead:
    receipt = await _load_receipt_with_lines(db, receipt_id)
    return _receipt_read_schema(receipt)


@router.post(
    "/purchase-orders/{purchase_order_id}/receive-goods",
    response_model=GoodsReceiptRead,
)
async def receive_goods_endpoint(
    request: Request,
    purchase_order_id: int,
    body: GoodsReceiptReceiveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("purchase_orders", "update"),
) -> GoodsReceiptRead:
    receipt, po_auto_closed = await receive_goods_for_purchase_order(
        db,
        purchase_order_id=purchase_order_id,
        branch_id=body.branch_id,
        lines=[ln.model_dump() for ln in body.lines],
        idempotency_key=body.idempotency_key,
        created_by_user_id=current_user.id,
        notes=body.notes,
    )
    if po_auto_closed:
        po = await load_purchase_order(db, purchase_order_id)
        po_read = await purchase_order_to_read_one(db, po)
        await audit_service.log(
            session=db,
            action="purchase_order.closed",
            resource_type="purchase_order",
            resource_id=str(po.id),
            new_value=po_read.model_dump(),
            user_id=current_user.id,
            request=request,
        )
        await db.commit()
    loaded = await _load_receipt_with_lines(db, receipt.id)
    return _receipt_read_schema(loaded)
