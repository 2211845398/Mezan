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
    employee_profile_id: int | None = None


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
    # Enriched user details for HR pending requests page
    user_email: str | None = None
    user_full_name: str | None = None
    user_branch_id: int | None = None
    user_branch_name: str | None = None
    user_status: str | None = None
    user_role_code: str | None = None
    user_role_name: str | None = None
    requested_by_name: str | None = None
    assigned_hr_name: str | None = None


class UserOnboardingSubjectUpdate(BaseModel):
    """HR edits the subject user while onboarding is still pending (no users:update required)."""

    full_name: str | None = None
    branch_id: int | None = None
    role_code: str | None = Field(default=None, max_length=64)


class WeeklyScheduleItem(BaseModel):
    """Schedule block to create during onboarding completion."""

    weekday: int = Field(ge=0, le=6)
    start_time: str  # HH:MM:SS format
    end_time: str  # HH:MM:SS format
    is_day_off: bool = False
    branch_id: int


class UserOnboardingComplete(BaseModel):
    assigned_hr_user_id: int | None = None
    job_title: str | None = None
    contract_start: date | None = None
    contract_end: date | None = None
    salary_amount: Decimal | None = None
    hourly_rate: Decimal | None = None
    salary_currency: str | None = None
    bank_account: str | None = None
    notes: str | None = None
    schedules: list[WeeklyScheduleItem] | None = None


class UserPermissionOverrideWrite(BaseModel):
    permission_id: int
    branch_id: int | None = None
    effect: Literal["allow", "deny"]
    reason: str | None = None


class UserPermissionOverrideRead(UserPermissionOverrideWrite):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_by_user_id: int | None = None
    created_at: datetime
