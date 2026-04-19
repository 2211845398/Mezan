"""Branch CRUD API (RBAC-protected)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.branch import Branch
from app.models.users import User
from app.schemas.branch import BranchCreate, BranchRead, BranchUpdate
from app.services import audit_service

router = APIRouter()


@router.get("/branches", response_model=list[BranchRead])
async def list_branches(
    db: AsyncSession = Depends(get_db),
    include_archived: bool = Query(False, description="Include soft-deleted branches"),
    _: None = Depends(get_current_user),
    __: None = require_permission("branches", "read"),
) -> list[BranchRead]:
    """List branches (active only unless include_archived). Requires branches:read."""
    q = select(Branch).order_by(Branch.code)
    if not include_archived:
        q = q.where(Branch.archived_at.is_(None))
    result = await db.execute(q)
    return [BranchRead.model_validate(b) for b in result.scalars().all()]


@router.post("/branches", response_model=BranchRead)
async def create_branch(
    body: BranchCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("branches", "create"),
) -> BranchRead:
    """Create a branch. Requires branches:create."""
    result = await db.execute(select(Branch).where(Branch.code == body.code))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Branch code already exists"
        )
    branch = Branch(
        name=body.name,
        code=body.code,
        address=body.address,
        timezone=body.timezone,
    )
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    await audit_service.log(
        session=db,
        action="branch.created",
        resource_type="branch",
        resource_id=str(branch.id),
        new_value=BranchRead.model_validate(branch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return BranchRead.model_validate(branch)


@router.get("/branches/{branch_id}", response_model=BranchRead)
async def get_branch(
    branch_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("branches", "read"),
) -> BranchRead:
    """Get one branch. Requires branches:read."""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    return BranchRead.model_validate(branch)


@router.put("/branches/{branch_id}", response_model=BranchRead)
async def update_branch(
    branch_id: int,
    body: BranchUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("branches", "update"),
) -> BranchRead:
    """Update branch. Requires branches:update."""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    old_value = BranchRead.model_validate(branch).model_dump()
    if body.name is not None:
        branch.name = body.name
    if body.address is not None:
        branch.address = body.address
    if body.timezone is not None:
        branch.timezone = body.timezone
    if body.is_active is not None:
        branch.is_active = body.is_active
    await db.commit()
    await db.refresh(branch)
    await audit_service.log(
        session=db,
        action="branch.updated",
        resource_type="branch",
        resource_id=str(branch.id),
        old_value=old_value,
        new_value=BranchRead.model_validate(branch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return BranchRead.model_validate(branch)


@router.delete("/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_branch(
    branch_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("branches", "delete"),
) -> None:
    """Soft-delete (archive) a branch. Idempotent. Requires branches:delete.

    Archived rows keep their ``code`` so duplicate-code checks still apply until renamed.
    """
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    if branch.archived_at is not None:
        return None
    old_value = BranchRead.model_validate(branch).model_dump()
    branch.archived_at = datetime.now(UTC)
    branch.is_active = False
    await db.commit()
    await db.refresh(branch)
    await audit_service.log(
        session=db,
        action="branch.archived",
        resource_type="branch",
        resource_id=str(branch.id),
        old_value=old_value,
        new_value=BranchRead.model_validate(branch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return None
