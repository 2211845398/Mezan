"""User CRUD API router."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.users import User
from app.schemas.users import UserCreate, UserRead

router = APIRouter()


@router.post("/users", response_model=UserRead)
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


@router.get("/users", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
) -> list[UserRead]:
    """List all users from the database."""
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users
