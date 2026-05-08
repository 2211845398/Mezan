"""Pydantic schemas for catalog and inventory master data (Epic 2)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    sort_order: int = 0
    is_active: bool = True
    parent_id: int | None = None
    image_url: str | None = Field(default=None, max_length=1024)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    sort_order: int | None = None
    is_active: bool | None = None
    parent_id: int | None = None
    image_url: str | None = Field(default=None, max_length=1024)


class CategoryRead(CategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CategoryImageUploadRead(BaseModel):
    """Response after uploading a category cover image to static storage."""

    image_url: str = Field(min_length=1, max_length=1024)


class ProductImageUploadRead(BaseModel):
    """Response after uploading a product cover image to static storage."""

    image_url: str = Field(min_length=1, max_length=1024)


class CategoryTreeNode(CategoryRead):
    children: list[CategoryTreeNode] = Field(default_factory=list)
    direct_product_count: int = 0


class CategoryAttributeDefBase(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=32)
    required: bool = False
    options: dict[str, Any] | None = None
    validation: dict[str, Any] | None = None
    sort_order: int = 0


class CategoryAttributeDefCreate(CategoryAttributeDefBase):
    pass


class CategoryAttributeDefUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = Field(default=None, min_length=1, max_length=32)
    required: bool | None = None
    options: dict[str, Any] | None = None
    validation: dict[str, Any] | None = None
    sort_order: int | None = None


class CategoryAttributeDefRead(CategoryAttributeDefBase):
    id: int
    category_id: int
    inherited_from_category_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CategoryAttributeDefListRead(CategoryAttributeDefRead):
    """Attribute row as shown on a category admin page (own + optional inherited/virtual)."""

    is_inherited: bool = False
    source_category_name: str | None = None


class ProductBase(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=255)
    sku: str = Field(min_length=1, max_length=128)
    barcode: str | None = Field(default=None, max_length=128)
    status: str = Field(default="active", max_length=32)
    attributes: dict[str, Any] = Field(default_factory=dict)
    standard_cost: Decimal | None = None
    output_vat_rate: Decimal = Field(
        default=Decimal("0"),
        ge=Decimal("0"),
        lt=Decimal("1"),
        description="Tax-exclusive rate fraction, e.g. 0.15 for 15%",
    )
    image_url: str | None = Field(default=None, max_length=1024)


class ProductCreate(BaseModel):
    """Create product; ``sku`` may be omitted to assign a stable server-generated SKU."""

    category_id: int
    name: str = Field(min_length=1, max_length=255)
    sku: str | None = Field(
        default=None,
        max_length=128,
        description="Omit or leave empty to auto-generate a unique SKU (e.g. PRD-000000001).",
    )
    barcode: str | None = Field(default=None, max_length=128)
    status: str = Field(default="active", max_length=32)
    attributes: dict[str, Any] = Field(default_factory=dict)
    standard_cost: Decimal | None = None
    output_vat_rate: Decimal = Field(
        default=Decimal("0"),
        ge=Decimal("0"),
        lt=Decimal("1"),
        description="Tax-exclusive rate fraction, e.g. 0.15 for 15%",
    )
    image_url: str | None = Field(default=None, max_length=1024)
    sell_price: Decimal | None = Field(
        default=None,
        description="Preferred sell-price input. `attributes.price` remains accepted for compatibility.",
    )
    sell_price_currency_id: int | None = None
    category_ids: list[int] | None = Field(
        default=None,
        description="Extra category tags; primary is ``category_id`` and is always included.",
    )

    @field_validator("sku", mode="before")
    @classmethod
    def normalize_optional_sku(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return v


class ProductUpdate(BaseModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = Field(default=None, min_length=1, max_length=128)
    barcode: str | None = Field(default=None, max_length=128)
    status: str | None = Field(default=None, max_length=32)
    attributes: dict[str, Any] | None = None
    standard_cost: Decimal | None = None
    output_vat_rate: Decimal | None = Field(
        default=None,
        ge=Decimal("0"),
        lt=Decimal("1"),
    )
    sell_price: Decimal | None = Field(
        default=None,
        description="Preferred sell-price input. `attributes.price` remains accepted for compatibility.",
    )
    sell_price_currency_id: int | None = None
    category_ids: list[int] | None = Field(
        default=None,
        description="Replace extra category tags; omit to leave unchanged.",
    )
    image_url: str | None = Field(default=None, max_length=1024)


class ProductRead(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime
    category_ids: list[int] = Field(
        default_factory=list,
        description="All linked categories including primary ``category_id``.",
    )

    model_config = {"from_attributes": True}
