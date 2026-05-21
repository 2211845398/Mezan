"""Schemas for variant preview/generate and sync."""

from __future__ import annotations

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
    sku: str = Field(min_length=1, max_length=128)
    barcode: str | None = Field(default=None, max_length=128)
    active: bool = True


class VariantSyncRequest(BaseModel):
    variants: list[VariantSyncRow] = Field(default_factory=list)


class VariantSyncResponse(BaseModel):
    created: int
    updated: int
    deactivated: int
    variant_ids: list[int]
