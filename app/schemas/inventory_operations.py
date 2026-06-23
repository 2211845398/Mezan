"""Schemas for ad-hoc receipt, reservations, and stock-count export."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class AdhocReceiptLineCreate(BaseModel):
    product_id: int
    qty: int = Field(gt=0)
    uom_id: int
    unit_cost: Decimal = Field(gt=0)
    variant_id: int | None = None


class AdhocGoodsReceiptCreate(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    branch_id: int
    supplier_id: int | None = None
    notes: str | None = Field(default=None, max_length=1024)
    lines: list[AdhocReceiptLineCreate] = Field(min_length=1)


class AdhocGoodsReceiptResponse(BaseModel):
    movement_ids: list[int]


class ReservationRead(BaseModel):
    movement_id: int
    branch_id: int
    branch_name: str
    product_id: int
    product_name: str
    variant_id: int
    variant_name: str
    reference_code: str
    qty_reserved: int
    qty_released: int
    qty_open: int
    created_at: str
    notes: str | None = None
    movement_kind: str = "reserve"
    ref_type: str | None = None
    ref_id: str | None = None
    transfer_batch_id: int | None = None
    releasable: bool = True


class ReservationReleaseCreate(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    quantity: int = Field(gt=0, description="Quantity in base units to release")
    notes: str | None = Field(default=None, max_length=1024)


class DamagedPositionRead(BaseModel):
    branch_id: int
    branch_name: str
    product_id: int
    product_name: str
    variant_id: int
    variant_name: str
    reference_code: str
    qty_damaged: int
    movement_id: int | None = None
    reason: str | None = None


class DamagedActionCreate(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    branch_id: int
    product_id: int
    variant_id: int | None = None
    quantity: int = Field(gt=0, description="Quantity in selected UoM (converted to base units)")
    uom_id: int | None = None
    notes: str | None = Field(default=None, max_length=1024)


class StockCountExportRequest(BaseModel):
    branch_id: int
    category_id: int | None = None
    category_include_descendants: bool = False
    product_ids: list[int] | None = None
    q: str | None = None
    responsible_name: str = Field(default="", max_length=128)
