"""Pydantic schemas for global catalog attributes."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.utils.attribute_code import normalize_attribute_code


class CatalogAttributeRead(BaseModel):
    id: int
    code: str
    name: str
    sort_order: int
    metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_row(cls, row: Any) -> CatalogAttributeRead:
        return cls(
            id=row.id,
            code=row.code,
            name=row.name,
            sort_order=row.sort_order,
            metadata=getattr(row, "metadata_", None),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class CatalogAttributeCreate(BaseModel):
    code: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    sort_order: int = 0
    metadata: dict[str, Any] | None = None

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, v: Any) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return normalize_attribute_code(str(v))


class CatalogAttributeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sort_order: int | None = None
    metadata: dict[str, Any] | None = None


class CatalogAttributeValueRead(BaseModel):
    id: int
    attribute_id: int
    code: str
    label: str
    sort_order: int
    metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_row(cls, row: Any) -> CatalogAttributeValueRead:
        return cls(
            id=row.id,
            attribute_id=row.attribute_id,
            code=row.code,
            label=row.label,
            sort_order=row.sort_order,
            metadata=getattr(row, "metadata_", None),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class CatalogAttributeValueCreate(BaseModel):
    code: str | None = Field(default=None, max_length=64)
    label: str = Field(min_length=1, max_length=255)
    sort_order: int = 0
    metadata: dict[str, Any] | None = None

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, v: Any) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return normalize_attribute_code(str(v))


class CatalogAttributeValueUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    sort_order: int | None = None
    metadata: dict[str, Any] | None = None
