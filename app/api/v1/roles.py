"""Roles and permissions API (RBAC management)."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.users import User
from app.schemas.role import (
    PermissionRead,
    RoleCreate,
    RolePermissionUpdate,
    RoleRead,
    RoleWithPermissions,
)
from app.services import audit_service

router = APIRouter()


@router.get("/permissions", response_model=list[PermissionRead])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("roles", "read"),
) -> list[PermissionRead]:
    """List all permissions. Requires roles:read (or a dedicated permission)."""
    result = await db.execute(select(Permission).order_by(Permission.resource, Permission.action))
    return [PermissionRead.model_validate(p) for p in result.scalars().all()]


@router.get("/roles", response_model=list[RoleWithPermissions])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("roles", "read"),
) -> list[RoleWithPermissions]:
    """List all roles with their permission ids. Requires roles:read."""
    result = await db.execute(
        select(Role).options(selectinload(Role.role_permissions)).order_by(Role.name)
    )
    roles = result.scalars().all()
    return [
        RoleWithPermissions(
            **RoleRead.model_validate(r).model_dump(),
            permission_ids=[rp.permission_id for rp in r.role_permissions],
        )
        for r in roles
    ]


@router.post("/roles", response_model=RoleRead)
async def create_role(
    body: RoleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("roles", "create"),
) -> RoleRead:
    """Create a custom role. Requires roles:create."""
    result = await db.execute(select(Role).where(Role.name == body.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Role name already exists"
        )
    if body.code:
        code_check = await db.execute(select(Role).where(Role.code == body.code.upper()))
        if code_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Role code already exists"
            )
    role = Role(
        code=body.code.upper() if body.code else None,
        name=body.name,
        description=body.description,
        is_system=False,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    await audit_service.log(
        session=db,
        action="role.created",
        resource_type="role",
        resource_id=str(role.id),
        new_value=RoleRead.model_validate(role).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return RoleRead.model_validate(role)


@router.put("/roles/{role_id}/permissions")
async def set_role_permissions(
    role_id: int,
    body: RolePermissionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("roles", "update"),
) -> RoleWithPermissions:
    """Set permissions for a role. Requires roles:update."""
    result = await db.execute(
        select(Role).options(selectinload(Role.role_permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if role.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify system role permissions"
        )
    # Replace role_permissions
    for rp in role.role_permissions:
        db.delete(rp)
    for pid in body.permission_ids:
        db.add(RolePermission(role_id=role_id, permission_id=pid))
    await audit_service.log(
        session=db,
        action="role.permissions_updated",
        resource_type="role",
        resource_id=str(role_id),
        new_value={"permission_ids": body.permission_ids},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(role)
    result2 = await db.execute(
        select(Role).options(selectinload(Role.role_permissions)).where(Role.id == role_id)
    )
    role = result2.scalar_one_or_none()
    perm_ids = [rp.permission_id for rp in role.role_permissions] if role else []
    return RoleWithPermissions(
        **RoleRead.model_validate(role).model_dump(), permission_ids=perm_ids
    )
