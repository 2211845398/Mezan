"""Pydantic schemas for user operations."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    """Schema for creating a new user (staff)."""

    email: EmailStr
    full_name: str | None = None
    password: str | None = None  # optional for SSO-only users
    status: str = "pending_onboarding"  # pending_onboarding, active, deactivated, suspended, banned
    branch_id: int | None = None
    role_code: str | None = Field(default=None, max_length=64)
    require_onboarding: bool = True
    assigned_hr_user_id: int | None = None


class UserUpdate(BaseModel):
    """Update user (status, profile, branch)."""

    full_name: str | None = None
    status: str | None = None  # active, deactivated, suspended, banned
    branch_id: int | None = None


class UserRead(BaseModel):
    """Schema for reading user information."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str | None = None
    status: str
    branch_id: int | None = None
    phone: str | None = None
    city: str | None = None
    preferred_language: str | None = None
    avatar_url: str | None = None
    last_login_at: datetime | None = None


class UserOnboardingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    status: str
    requested_by_user_id: int | None = None
    assigned_hr_user_id: int | None = None
    job_title: str | None = None
    contract_start: date | None = None
    contract_end: date | None = None
    salary_amount: Decimal | None = None
    salary_currency: str | None = None
    notes: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UserOnboardingComplete(BaseModel):
    assigned_hr_user_id: int | None = None
    job_title: str | None = None
    contract_start: date | None = None
    contract_end: date | None = None
    salary_amount: Decimal | None = None
    salary_currency: str | None = None
    notes: str | None = None


class UserPermissionOverrideWrite(BaseModel):
    permission_id: int
    branch_id: int | None = None
    effect: Literal["allow", "deny"]
    reason: str | None = None


class UserPermissionOverrideRead(UserPermissionOverrideWrite):
    id: int
    user_id: int
    created_by_user_id: int | None = None
    created_at: datetime
