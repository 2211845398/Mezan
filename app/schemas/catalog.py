"""Pydantic schemas for catalog and inventory master data (Epic 2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    sort_order: int = 0
    is_active: bool = True
    parent_id: int | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    sort_order: int | None = None
    is_active: bool | None = None
    parent_id: int | None = None


class CategoryRead(CategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CategoryTreeNode(CategoryRead):
    children: list["CategoryTreeNode"] = Field(default_factory=list)


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductBase(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=255)
    sku: str = Field(min_length=1, max_length=128)
    barcode: str | None = Field(default=None, max_length=128)
    status: str = Field(default="active", max_length=32)
    attributes: dict[str, Any] = Field(default_factory=dict)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = Field(default=None, min_length=1, max_length=128)
    barcode: str | None = Field(default=None, max_length=128)
    status: str | None = Field(default=None, max_length=32)
    attributes: dict[str, Any] | None = None


class ProductRead(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

