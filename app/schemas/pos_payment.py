"""Pydantic schemas for POS payment intents."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PaymentIntentCreateRequest(BaseModel):
    cart_id: int
    provider: str = "mock"
    currency: str = "USD"


class PaymentCaptureRequest(BaseModel):
    payment_intent_id: int
    idempotency_key: str = Field(min_length=8, max_length=128)
    method: str = "card"
    reference: str | None = None


class PaymentIntentRead(BaseModel):
    id: int
    cart_id: int
    provider: str
    amount: float
    currency: str
    status: str
    external_id: str | None

    model_config = {"from_attributes": True}
