"""Pydantic schemas for POS payment intents."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class PaymentIntentCreateRequest(BaseModel):
    cart_id: int
    provider: str | None = None
    currency: str = "USD"


class PaymentCaptureRequest(BaseModel):
    payment_intent_id: int
    idempotency_key: str = Field(min_length=8, max_length=128)
    method: Literal["cash", "card", "other"] = "card"
    reference: str | None = None
    card_last4: str | None = Field(default=None, pattern=r"^\d{4}$")

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
    amount: float
    currency: str
    status: str
    external_id: str | None

    model_config = {"from_attributes": True}
