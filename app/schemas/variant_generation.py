"""Schemas for variant preview/generate and sync."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class AttributeSummaryItem(BaseModel):
    attribute_id: int
    attribute_value_id: int
    attribute_code: str
    value_code: str
    label: str


class VariantPreviewRow(BaseModel):
    attribute_value_ids: list[int]
    suggested_sku: str
    display_label: str
    exists: bool
    attribute_summary: list[AttributeSummaryItem]


class VariantPreviewRequest(BaseModel):
    axes: dict[int, list[int]] = Field(
        description="attribute_id → list of attribute_value_id",
    )


class VariantPreviewResponse(BaseModel):
    rows: list[VariantPreviewRow]
    count: int


class VariantSyncRow(BaseModel):
    id: int | None = None
    attribute_value_ids: list[int] = Field(default_factory=list)
    sku: str | None = Field(
        default=None, max_length=128, description="Ignored; server computes system SKU."
    )
    reference_code: str | None = Field(default=None, max_length=128)
    barcode: str | None = Field(
        default=None, max_length=128, description="Ignored; server assigns EAN-13."
    )
    active: bool = True
    price_extra: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))


class VariantSyncRequest(BaseModel):
    axes: dict[int, list[int]] | None = Field(
        default=None,
        description="Optional template axes to persist before syncing variants.",
    )
    variants: list[VariantSyncRow] = Field(default_factory=list)


class ProductAxisLineRead(BaseModel):
    attribute_id: int
    attribute_code: str
    attribute_name: str
    sort_order: int
    value_ids: list[int]


class ProductVariantDetailRead(BaseModel):
    id: int
    sku: str
    reference_code: str | None = None
    barcode: str | None
    attribute_values: dict
    attribute_value_ids: list[int]
    active: bool
    price_extra: Decimal
    display_label: str
    combination_key: str
    stock_by_branch: dict[int, Decimal | int]
    last_cost_by_branch: dict[int, Decimal]
    sell_price: Decimal | None = None


class ProductWithVariantsRead(BaseModel):
    product: dict
    axes: list[ProductAxisLineRead]
    variants: list[ProductVariantDetailRead]
    variant_count: int


class VariantSyncResponse(BaseModel):
    created: int
    updated: int
    deactivated: int
    variant_ids: list[int]
