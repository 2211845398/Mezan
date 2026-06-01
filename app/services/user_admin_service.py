"""Admin user listing (paginated)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User
from app.schemas.pagination import clamp_pagination


async def list_users_page(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[User], int]:
    limit, offset = clamp_pagination(limit, offset)
    total = int(await db.scalar(select(func.count()).select_from(User)) or 0)
    res = await db.execute(
        select(User).order_by(User.id.asc()).limit(limit).offset(offset)
    )
    return list(res.scalars().all()), total
