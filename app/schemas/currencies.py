"""Currency master and accounting settings schemas."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class CurrencyRead(BaseModel):
    id: int
    code: str
    name: str
    decimal_places: int
    suffix: str | None
    exchange_rate_to_base: Decimal | None
    active: bool
    is_base: bool = False
    cash_rounding_increment: Decimal | None = None

    model_config = {"from_attributes": True}


class CurrencyCreate(BaseModel):
    code: str = Field(min_length=3, max_length=3)
    name: str = Field(min_length=1, max_length=128)
    decimal_places: int = Field(default=2, ge=0, le=6)
    suffix: str | None = Field(default=None, max_length=16)
    exchange_rate_to_base: Decimal | None = Field(default=None, gt=0)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        c = v.strip().upper()
        if len(c) != 3 or not c.isalpha():
            raise ValueError("code must be a 3-letter ISO currency code")
        return c


class CurrencyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    decimal_places: int | None = Field(default=None, ge=0, le=6)
    suffix: str | None = Field(default=None, max_length=16)
    active: bool | None = None
    cash_rounding_increment: Decimal | None = Field(default=None, ge=0)


class CurrencyRateUpdate(BaseModel):
    exchange_rate_to_base: Decimal = Field(gt=0)


class AccountingSettingsRead(BaseModel):
    base_currency_id: int
    base_currency_code: str
    base_currency_name: str


class AccountingSettingsUpdate(BaseModel):
    base_currency_id: int
