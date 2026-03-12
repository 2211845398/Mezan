"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from typing import List

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db, init_db, close_db
from app.models import User


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    if settings.is_development:
        await init_db()
    yield
    # Shutdown
    await close_db()


# Create FastAPI application
app = FastAPI(
    title="Mezan ERP System",
    description="Comprehensive ERP and Retail Management System",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

class UserCreate(BaseModel):
    """Schema for creating a new user."""

    email: EmailStr
    full_name: str | None = None


class UserRead(BaseModel):
    """Schema for reading user information."""

    id: int
    email: EmailStr
    full_name: str | None = None

    class Config:
        from_attributes = True


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Mezan ERP System API",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
    }


@app.post("/users", response_model=UserRead)
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    """Create a new user in the database."""
    user = User(email=user_in.email, full_name=user_in.full_name)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@app.get("/users", response_model=List[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
) -> List[UserRead]:
    """List all users from the database."""
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users
