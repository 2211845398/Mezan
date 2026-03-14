"""User CRUD API router (RBAC-protected)."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.schemas.role import UserRoleAssign
from app.schemas.users import UserCreate, UserRead, UserUpdate
from app.services import audit_service
from app.utils.security import hash_password

router = APIRouter()


@router.post("/users", response_model=UserRead)
async def create_user(
    user_in: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("users", "create"),
) -> UserRead:
    """Create a new user (staff). Requires users:create permission."""
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        password_hash=hash_password(user_in.password) if user_in.password else None,
        status=user_in.status or "active",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await audit_service.log(
        session=db,
        action="user.created",
        resource_type="user",
        resource_id=str(user.id),
        new_value=UserRead.model_validate(user).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return user


@router.get("/users", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("users", "read"),
) -> list[UserRead]:
    """List all users. Requires users:read permission."""
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users


@router.get("/users/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("users", "read"),
) -> UserRead:
    """Get one user. Requires users:read."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("users", "update"),
) -> UserRead:
    """Update user (status, full_name, branch). Requires users:update."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    old_value = UserRead.model_validate(user).model_dump()
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.status is not None:
        user.status = body.status
    if body.branch_id is not None:
        user.branch_id = body.branch_id
    await db.commit()
    await db.refresh(user)
    await audit_service.log(
        session=db,
        action="user.updated",
        resource_type="user",
        resource_id=str(user.id),
        old_value=old_value,
        new_value=UserRead.model_validate(user).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return user


@router.get("/users/{user_id}/roles")
async def get_user_roles(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("users", "read"),
) -> list[dict]:
    """List roles assigned to a user. Requires users:read."""
    result = await db.execute(
        select(UserRole, Role).join(Role, UserRole.role_id == Role.id).where(UserRole.user_id == user_id)
    )
    rows = result.all()
    return [{"role_id": r.id, "role_name": r.name, "branch_id": ur.branch_id} for ur, r in rows]


@router.post("/users/{user_id}/roles")
async def add_user_role(
    user_id: int,
    body: UserRoleAssign,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("users", "update"),
) -> dict:
    """Assign a role to a user (optional branch). Requires users:update."""
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    result = await db.execute(select(Role).where(Role.id == body.role_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    q = select(UserRole).where(UserRole.user_id == user_id, UserRole.role_id == body.role_id)
    if body.branch_id is not None:
        q = q.where(UserRole.branch_id == body.branch_id)
    else:
        q = q.where(UserRole.branch_id.is_(None))
    result = await db.execute(q)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already has this role")
    ur = UserRole(user_id=user_id, role_id=body.role_id, branch_id=body.branch_id)
    db.add(ur)
    await db.commit()
    return {"message": "Role assigned", "user_id": user_id, "role_id": body.role_id, "branch_id": body.branch_id}
