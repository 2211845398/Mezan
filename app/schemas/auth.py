"""Pydantic schemas for auth: login, refresh, password reset, profile."""

from typing import Self

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.utils.libyan_phone import require_libyan_mobile

_PROFILE_STRING_MAX = 128


class LoginRequest(BaseModel):
    """Login with email and password."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginResponse(TokenResponse):
    """Login response with refresh token."""

    refresh_token: str
    user_id: int
    email: str


class RefreshRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str


class LogoutRequest(BaseModel):
    """Logout request."""

    refresh_token: str


class PasswordResetRequest(BaseModel):
    """Request password reset (sends email if user exists)."""

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Confirm password reset with token and new password."""

    token: str
    new_password: str = Field(..., min_length=8)


class ProfileUpdate(BaseModel):
    """Update current user profile (identity, contact, language, optional password)."""

    email: EmailStr | None = None
    first_name: str | None = Field(default=None, max_length=255)
    father_name: str | None = Field(default=None, max_length=255)
    family_name: str | None = Field(default=None, max_length=255)
    phone: str | None = None
    city: str | None = Field(default=None, max_length=_PROFILE_STRING_MAX)
    preferred_language: str | None = None
    avatar_url: str | None = Field(default=None, max_length=2048)
    current_password: str | None = Field(default=None, min_length=1)
    new_password: str | None = Field(default=None, min_length=8)

    @field_validator("current_password", "new_password", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone_blank(cls, v: object) -> object:
        if v == "":
            return None
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("phone")
    @classmethod
    def libyan_mobile_format(cls, v: str | None) -> str | None:
        """Libyan national phone: ``09`` + operator digit 1–5 + seven digits (10 digits total)."""
        if v is None:
            return None
        return require_libyan_mobile(v)

    @model_validator(mode="after")
    def password_change_requires_current(self) -> Self:
        if self.new_password is not None:
            if not self.current_password:
                raise ValueError("current_password is required when new_password is set")
        return self
