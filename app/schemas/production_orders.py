"""Pydantic schemas for Production Orders (Epic 20.3)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class BomLineRead(BaseModel):
    id: int
    component_product_id: int
    component_product_name: str = ""
    qty_required: Decimal
    unit_cost_at_creation: Decimal | None = None
    notes: str | None = None

    class Config:
        from_attributes = True


class BillOfMaterialsRead(BaseModel):
    id: int
    name: str
    finished_product_id: int
    finished_product_name: str = ""
    version: str
    is_active: bool
    notes: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class BillOfMaterialsDetailRead(BillOfMaterialsRead):
    lines: list[BomLineRead] = []


class BomCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    finished_product_id: int
    version: str = Field(default="1.0", max_length=32)
    notes: str | None = Field(None, max_length=1000)


class BomLineCreateRequest(BaseModel):
    component_product_id: int
    qty_required: Decimal = Field(..., gt=0)
    notes: str | None = Field(None, max_length=255)


class ProductionOrderRead(BaseModel):
    id: int
    order_number: str
    bom_id: int
    bom_name: str = ""
    branch_id: int
    branch_name: str = ""
    qty_to_produce: Decimal
    qty_produced: Decimal
    status: str
    planned_start: datetime | None = None
    planned_end: datetime | None = None
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    total_cost_issued: Decimal
    finished_goods_value: Decimal
    notes: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProductionOrderCreateRequest(BaseModel):
    bom_id: int
    branch_id: int
    qty_to_produce: Decimal = Field(..., gt=0)
    planned_start: datetime | None = None
    planned_end: datetime | None = None
    notes: str | None = Field(None, max_length=1000)


class ProductionOrderIssueRead(BaseModel):
    id: int
    product_id: int
    product_name: str = ""
    qty_issued: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    issued_at: datetime

    class Config:
        from_attributes = True


class ProductionOrderReceiptRead(BaseModel):
    id: int
    product_id: int
    product_name: str = ""
    qty_received: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    received_at: datetime

    class Config:
        from_attributes = True


class BomCostCalculationRequest(BaseModel):
    bom_id: int
    branch_id: int
    qty: Decimal = Field(default=Decimal("1"), gt=0)


class BomCostCalculationRead(BaseModel):
    bom_id: int
    finished_product_id: int
    qty: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    lines: list[dict] = []
