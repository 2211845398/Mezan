"""Pydantic schemas for auth: login, refresh, password reset, profile."""

from pydantic import BaseModel, EmailStr, Field


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
    """Update current user profile (contact, language)."""

    full_name: str | None = None
    phone: str | None = None
    preferred_language: str | None = None
