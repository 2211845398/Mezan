"""Authentication API router."""

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

from app.services.auth_service import authenticate_user

router = APIRouter()


class LoginRequest(BaseModel):
    """Schema for login request."""

    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Schema for login response."""

    message: str
    authenticated: bool


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest) -> LoginResponse:
    """Login endpoint (stub)."""
    result = await authenticate_user(credentials.email, credentials.password)
    return LoginResponse(
        message=result["message"],
        authenticated=result["authenticated"],
    )
