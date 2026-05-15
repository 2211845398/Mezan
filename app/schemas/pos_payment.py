"""Pydantic schemas for POS payment intents."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PaymentIntentCreateRequest(BaseModel):
    cart_id: int
    provider: str | None = None
    currency: str = Field(default="USD", min_length=3, max_length=3)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str) -> str:
        s = v.strip().upper()
        if len(s) != 3 or not s.isalpha():
            raise ValueError("currency must be a 3-letter ISO 4217-style code")
        return s


class PaymentCaptureRequest(BaseModel):
    payment_intent_id: int
    idempotency_key: str = Field(min_length=8, max_length=128)
    method: Literal["cash", "card", "transfer", "other"] = "card"
    reference: str | None = None
    card_last4: str | None = Field(default=None, pattern=r"^\d{4}$")
    """When set for cash tenders, receipt amount (must be ≤ intent amount). Shortfall vs invoice requires a cart customer."""
    cash_tendered: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_card_fields(self):
        if self.method == "card" and self.card_last4 is None:
            raise ValueError("card_last4 is required when method is card")
        if self.method != "card" and self.card_last4 is not None:
            raise ValueError("card_last4 is only allowed for card payments")
        return self


class PaymentIntentRead(BaseModel):
    id: int
    cart_id: int
    provider: str
    amount: Decimal
    currency: str
    exchange_rate: Decimal
    status: str
    external_id: str | None

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: str})
