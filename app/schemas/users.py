"""Pydantic schemas for user operations."""

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    """Schema for creating a new user (staff)."""

    email: EmailStr
    full_name: str | None = None
    password: str | None = None  # optional for SSO-only users
    status: str = "active"  # active, deactivated, suspended, banned


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
    phone: str | None = None
    preferred_language: str | None = None
