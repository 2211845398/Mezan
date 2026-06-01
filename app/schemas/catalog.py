"""Pydantic schemas for catalog and inventory master data (Epic 2)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.pagination import PaginatedListResponse


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


class UnitOfMeasureRead(BaseModel):
    id: int
    code: str
    name: str
    symbol: str
    measurement_category: str = "discrete"

    model_config = {"from_attributes": True}


class ProductAlternativeUomWrite(BaseModel):
    uom_id: int
    factor_to_base: int = Field(
        gt=0,
        description="Whole number of base units in one unit of this alternative UoM.",
    )


class ProductAlternativeUomRead(BaseModel):
    uom_id: int
    uom_code: str
    uom_name: str
    uom_symbol: str
    measurement_category: str
    factor_to_base: int


class ProductVariantPurchasingSearchItem(BaseModel):
    """Variant row for purchasing UIs (display name is the parent product)."""

    variant_id: int
    product_id: int
    category_id: int
    display_name: str
    sku: str
    reference_code: str | None = None
    barcode: str | None = None
    variant_label: str = ""
    variant_attributes: str = ""
    attribute_values: dict[str, Any] | None = None


class CategoryTreeNode(CategoryRead):
    children: list[CategoryTreeNode] = Field(default_factory=list)
    direct_product_count: int = 0


class TaxDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str | None = Field(default=None, max_length=64)
    rate: Decimal = Field(
        default=Decimal("0"),
        ge=Decimal("0"),
        lt=Decimal("1"),
        description="Tax-exclusive fraction, e.g. 0.15 for 15%",
    )
    is_active: bool = True

    @field_validator("code", mode="before")
    @classmethod
    def empty_code_to_none(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


class TaxDefinitionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, max_length=64)
    rate: Decimal | None = Field(default=None, ge=Decimal("0"), lt=Decimal("1"))
    is_active: bool | None = None

    @field_validator("code", mode="before")
    @classmethod
    def empty_code_to_none(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


class TaxDefinitionRead(BaseModel):
    id: int
    name: str
    code: str | None
    rate: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductBase(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=255)
    sku: str = Field(min_length=1, max_length=128)
    barcode: str | None = Field(default=None, max_length=128)
    status: str = Field(default="active", max_length=32)
    standard_cost: Decimal | None = None
    output_vat_rate: Decimal = Field(
        default=Decimal("0"),
        ge=Decimal("0"),
        lt=Decimal("1"),
        description="Tax-exclusive rate fraction, e.g. 0.15 for 15%",
    )
    image_url: str | None = Field(default=None, max_length=1024)
    uom_id: int | None = Field(
        default=None,
        description="Unit of measure; defaults to Piece when omitted.",
    )


class ProductCreate(BaseModel):
    """Create product; ``sku`` may be omitted to assign a stable server-generated SKU."""

    category_id: int
    name: str = Field(min_length=1, max_length=255)
    sku: str | None = Field(
        default=None,
        max_length=128,
        description="Omit or leave empty to auto-generate from category slug + id (e.g. BEV-010). English letters, numbers, hyphens only.",
    )
    barcode: str | None = Field(default=None, max_length=128)
    status: str = Field(default="active", max_length=32)
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
        description="Preferred sell-price input.",
    )
    sell_price_currency_id: int | None = None
    category_ids: list[int] | None = Field(
        default=None,
        description="Extra category tags; primary is ``category_id`` and is always included.",
    )
    tax_definition_ids: list[int] | None = Field(
        default=None,
        description="Output tax definitions applied to this product (parallel rates on exclusive base).",
    )
    uom_id: int | None = Field(
        default=None,
        description="Base unit of measure; defaults to Piece when omitted.",
    )
    alternative_uoms: list[ProductAlternativeUomWrite] | None = Field(
        default=None,
        description="Alternative units with conversion factor to the base unit.",
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
    standard_cost: Decimal | None = None
    output_vat_rate: Decimal | None = Field(
        default=None,
        ge=Decimal("0"),
        lt=Decimal("1"),
    )
    sell_price: Decimal | None = Field(
        default=None,
        description="Preferred sell-price input.",
    )
    sell_price_currency_id: int | None = None
    category_ids: list[int] | None = Field(
        default=None,
        description="Replace extra category tags; omit to leave unchanged.",
    )
    tax_definition_ids: list[int] | None = Field(
        default=None,
        description="Replace applied tax definitions; omit to leave unchanged.",
    )
    image_url: str | None = Field(default=None, max_length=1024)
    uom_id: int | None = Field(
        default=None,
        description="Base unit of measure; omit to leave unchanged.",
    )
    alternative_uoms: list[ProductAlternativeUomWrite] | None = Field(
        default=None,
        description="Replace alternative units; omit to leave unchanged.",
    )


class ProductRead(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime
    category_ids: list[int] = Field(
        default_factory=list,
        description="All linked categories including primary ``category_id``.",
    )
    tax_definition_ids: list[int] = Field(
        default_factory=list,
        description="Linked catalog tax definition ids (junction table).",
    )
    variant_count: int = Field(
        default=0,
        description="Number of active product variants for this template.",
    )
    has_variants: bool = Field(
        default=False,
        description="True when the product has more than one active variant.",
    )
    uom_name: str = Field(default="Piece", description="Display name of the base unit of measure.")
    uom_symbol: str = Field(default="pcs", description="Short symbol for base quantities.")
    alternative_uoms: list[ProductAlternativeUomRead] = Field(
        default_factory=list,
        description="Alternative units with conversion to the base unit.",
    )

    model_config = {"from_attributes": True}


class ProductListResponse(PaginatedListResponse[ProductRead]):
    """Paginated product catalog list."""
