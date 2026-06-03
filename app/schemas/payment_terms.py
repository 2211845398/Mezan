"""Payment terms master schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PaymentTermRead(BaseModel):
    id: int
    code: str
    name_en: str
    name_ar: str
    days: int
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentTermCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name_en: str = Field(min_length=1, max_length=128)
    name_ar: str = Field(min_length=1, max_length=128)
    days: int = Field(ge=0, le=3650)
    active: bool = True


class PaymentTermUpdate(BaseModel):
    name_en: str | None = Field(default=None, min_length=1, max_length=128)
    name_ar: str | None = Field(default=None, min_length=1, max_length=128)
    days: int | None = Field(default=None, ge=0, le=3650)
    active: bool | None = None
