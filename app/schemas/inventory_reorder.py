"""Reorder alerts and PO creation from inventory."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ReorderAlertRow(BaseModel):
    branch_id: int
    branch_name: str
    product_id: int
    sku: str
    product_name: str
    available: int
    on_order: int
    in_transit_in: int
    cover: int
    reorder_point: int
    reorder_qty: int
    preferred_supplier_id: int | None
    supplier_name: str | None
    severity: str


class CreatePurchaseOrdersFromReorderRequest(BaseModel):
    """Optional filters; when empty, all current alerts are grouped into POs."""

    branch_ids: list[int] | None = None
    product_ids: list[int] | None = None
    idempotency_prefix: str = Field(default="reorder_po", min_length=4, max_length=64)


class CreatedPurchaseOrderRef(BaseModel):
    purchase_order_id: int
    branch_id: int
    supplier_id: int


class CreatePurchaseOrdersFromReorderResponse(BaseModel):
    created: list[CreatedPurchaseOrderRef]


class ReorderAlertCountRead(BaseModel):
    count: int


class CommercialRestockAlertRow(ReorderAlertRow):
    """Commercial branch restock alert with transfer prefill hints."""

    variant_id: int
    variant_name: str = ""
    variant_sku: str = ""
    reference_code: str = ""
    suggested_qty: int
    suggested_from_branch_id: int | None = None
    suggested_from_branch_name: str | None = None
    source_available: int = 0
    can_prefill_transfer: bool = False
    uom_id: int | None = None
    product_image_url: str | None = None
