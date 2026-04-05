"""Pydantic schemas for POS / CRM customer profiles."""

from __future__ import annotations

from pydantic import BaseModel


class CustomerCreateTemporaryRequest(BaseModel):
    phone: str


class CustomerCompleteOnboardingRequest(BaseModel):
    token: str
    full_name: str | None = None
    email: str | None = None


class CustomerRead(BaseModel):
    id: int
    phone: str
    full_name: str | None
    email: str | None
    is_temporary: bool

    model_config = {"from_attributes": True}
