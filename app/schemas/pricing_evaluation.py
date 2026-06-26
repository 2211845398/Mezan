"""Schemas for pricing & inventory valuation evaluation (catalog pricing matrix)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class VariantAttributeTagRead(BaseModel):
    attribute_name: str
    value_label: str


class FifoLayerRead(BaseModel):
    layer_index: int
    qty_remaining: Decimal
    unit_cost: Decimal
    received_at: str
    source_type: str | None = None


class WavgBreakdownRead(BaseModel):
    old_qty: Decimal
    old_cost: Decimal
    new_qty: Decimal
    new_cost: Decimal
    total_qty: Decimal
    blended_cost: Decimal
    formula: str


class PurchaseHistoryLineRead(BaseModel):
    receipt_id: int
    received_at: str
    qty: int
    unit_cost: Decimal
    supplier_name: str | None = None
    invoice_number: str | None = None


class PricingEvaluationRowRead(BaseModel):
    product_id: int
    variant_id: int
    variant_label: str | None = None
    variant_sku: str | None = None
    variant_barcode: str | None = None
    name: str
    sku: str
    category_id: int
    category_name: str
    qty_on_hand: int
    current_system_cost: Decimal
    last_received_cost: Decimal | None = None
    last_received_qty: int | None = None
    last_received_at: str | None = None
    current_sell_price: Decimal | None = None
    has_sell_price: bool
    valuation_cost: Decimal
    default_markup_pct: Decimal = Field(default=Decimal("30"))
    suggested_price: Decimal | None = None
    implied_markup_pct: Decimal | None = None
    needs_pricing_review: bool = False
    fifo_layers: list[FifoLayerRead] | None = None
    wavg_breakdown: WavgBreakdownRead | None = None


class PricingEvaluationResponse(BaseModel):
    valuation_policy: str
    valuation_policy_label: str
    branch_id: int | None = None
    currency_code: str
    default_markup_pct: Decimal = Field(default=Decimal("30"))
    total: int
    items: list[PricingEvaluationRowRead]


class PricingCommitRequest(BaseModel):
    product_id: int = Field(..., gt=0)
    variant_id: int | None = Field(default=None, gt=0)
    sell_price: Decimal = Field(..., gt=0)


class PricingCommitResponse(BaseModel):
    product_id: int
    variant_id: int | None = None
    sell_price: Decimal
    currency_id: int
