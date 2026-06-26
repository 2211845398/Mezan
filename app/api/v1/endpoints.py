"""User CRUD API router (RBAC-protected)."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.config import settings
from app.core.errors import AppError, ValidationError
from app.db.database import get_db
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.schemas.employees import IdentityDocumentImageResponse
from app.schemas.role import UserRoleAssign
from app.schemas.users import (
    UserCreate,
    UserListResponse,
    UserOnboardingComplete,
    UserOnboardingRead,
    UserOnboardingSubjectUpdate,
    UserPermissionOverrideRead,
    UserPermissionOverrideWrite,
    UserRead,
    UserUpdate,
)
from app.services import audit_service, auth_service, bootstrap_admin_protection
from app.services.effective_permissions import (
    list_onboarding_assignee_users,
    user_can_act_as_onboarding_assignee,
)
from app.services.realtime_nav_badges import emit_onboarding_nav_badges_invalidate
from app.services.user_admin_service import list_users_page
from app.services.user_lifecycle_service import (
    assign_role_by_code,
    complete_onboarding_task,
    delete_user_permission_override,
    ensure_onboarding_task,
    list_onboarding_tasks_enriched,
    list_user_permission_overrides,
    save_onboarding_identity_document_image,
    update_pending_onboarding_subject,
    upsert_user_permission_override,
)

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
    existing = await db.execute(select(User).where(User.email == str(user_in.email)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email_already_exists")

    if user_in.assigned_hr_user_id is not None:
        if not await user_can_act_as_onboarding_assignee(db, user_in.assigned_hr_user_id):
            raise AppError(
                code="onboarding_assignee_ineligible",
                message="Onboarding assignee is not eligible",
                http_status=422,
                details={"detail": "onboarding_assignee_ineligible"},
            )

    user = User(
        email=str(user_in.email),
        first_name=user_in.first_name,
        father_name=user_in.father_name,
        family_name=user_in.family_name,
        password_hash=None,
        status="suspended",
        branch_id=user_in.branch_id,
        must_change_password=False,
    )
    db.add(user)
    await db.flush()

    if user_in.role_code:
        await assign_role_by_code(db, user_id=user.id, role_code=user_in.role_code)

    # Always create onboarding task for new users
    await ensure_onboarding_task(
        db,
        user_id=user.id,
        requested_by_user_id=current_user.id,
        assigned_hr_user_id=user_in.assigned_hr_user_id,
    )

    await db.commit()
    await db.refresh(user)
    await audit_service.log(
        session=db,
        action="user.created",
        resource_type="user",
        resource_id=str(user.id),
        new_value=bootstrap_admin_protection.user_read_with_protection_flag(user).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await emit_onboarding_nav_badges_invalidate()
    return bootstrap_admin_protection.user_read_with_protection_flag(user)


@router.get("/users", response_model=UserListResponse)
async def list_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("users", "read"),
) -> UserListResponse:
    """Paginated user list. Requires users:read permission."""
    users, total = await list_users_page(db, limit=limit, offset=offset)
    items = [bootstrap_admin_protection.user_read_with_protection_flag(u) for u in users]
    return UserListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/users/onboarding-assignees", response_model=list[UserRead])
async def list_onboarding_assignees(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("users", "read"),
) -> list[UserRead]:
    """Users eligible to be assigned as onboarding reviewer (active + effective HR permissions)."""
    rows = await list_onboarding_assignee_users(db)
    return [bootstrap_admin_protection.user_read_with_protection_flag(u) for u in rows]


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
    return bootstrap_admin_protection.user_read_with_protection_flag(user)


@router.patch("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("users", "update"),
) -> UserRead:
    """Update user (status, name parts, branch). Requires users:update."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    old_value = bootstrap_admin_protection.user_read_with_protection_flag(user).model_dump()
    if body.first_name is not None:
        user.first_name = body.first_name
    if body.father_name is not None:
        user.father_name = body.father_name
    if body.family_name is not None:
        user.family_name = body.family_name
    if body.status is not None:
        if body.status == "deactivated" and user_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cannot_deactivate_self",
            )
        bootstrap_admin_protection.assert_bootstrap_admin_may_not_be_deactivated(user, body.status)
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
        new_value=bootstrap_admin_protection.user_read_with_protection_flag(user).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return bootstrap_admin_protection.user_read_with_protection_flag(user)


@router.get("/users/{user_id}/roles")
async def get_user_roles(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("users", "read"),
) -> list[dict]:
    """List roles assigned to a user. Requires users:read."""
    result = await db.execute(
        select(UserRole, Role)
        .join(Role, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    rows = result.all()
    return [
        {
            "role_id": r.id,
            "role_code": r.code,
            "role_name": r.name,
            "branch_id": ur.branch_id,
        }
        for ur, r in rows
    ]


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
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.status == "deactivated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_deactivated_cannot_assign_role",
        )
    bootstrap_admin_protection.assert_bootstrap_admin_may_not_add_roles(user)
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="User already has this role"
        )
    ur = UserRole(user_id=user_id, role_id=body.role_id, branch_id=body.branch_id)
    db.add(ur)
    await db.commit()
    return {
        "message": "Role assigned",
        "user_id": user_id,
        "role_id": body.role_id,
        "branch_id": body.branch_id,
    }


@router.delete(
    "/users/{user_id}/roles",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_user_role(
    user_id: int,
    body: UserRoleAssign,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("users", "update"),
) -> None:
    """Remove a role assignment (same keys as assign). Requires users:update."""
    ures = await db.execute(select(User).where(User.id == user_id))
    target_user = ures.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    rres = await db.execute(select(Role).where(Role.id == body.role_id))
    role = rres.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    bootstrap_admin_protection.assert_bootstrap_admin_admin_role_not_removed(target_user, role.code)

    q = select(UserRole).where(
        UserRole.user_id == user_id,
        UserRole.role_id == body.role_id,
    )
    if body.branch_id is not None:
        q = q.where(UserRole.branch_id == body.branch_id)
    else:
        q = q.where(UserRole.branch_id.is_(None))
    result = await db.execute(q)
    ur = result.scalar_one_or_none()
    if not ur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Role assignment not found"
        )
    await db.delete(ur)
    await audit_service.log(
        session=db,
        action="user.role_removed",
        resource_type="user",
        resource_id=str(user_id),
        new_value={"role_id": body.role_id, "branch_id": body.branch_id},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


@router.post("/users/{user_id}/password-reset-request")
async def admin_request_password_reset(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("users", "update"),
) -> dict:
    """Start password reset for another user (same effect as /auth/password-reset/request)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    bootstrap_admin_protection.assert_bootstrap_admin_password_reset_forbidden(user)
    await auth_service.request_password_reset(db, str(user.email))
    await audit_service.log(
        session=db,
        action="user.password_reset.requested",
        resource_type="user",
        resource_id=str(user_id),
        new_value={"email": str(user.email)},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return {"message": "If the account exists, a reset link has been sent."}


@router.get("/hr/onboarding/pending", response_model=list[UserOnboardingRead])
async def list_pending_onboarding(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("onboarding", "read"),
) -> list[UserOnboardingRead]:
    rows = await list_onboarding_tasks_enriched(db, status_filter="pending")
    rows = [
        row
        for row in rows
        if row["onboarding"].assigned_hr_user_id is None
        or row["onboarding"].assigned_hr_user_id == current_user.id
    ]
    # Merge enriched data into the response model
    result = []
    for row in rows:
        onboarding = row["onboarding"]
        data = UserOnboardingRead.model_validate(onboarding).model_dump()
        data.update(
            {
                "user_email": row["user_email"],
                "user_first_name": row["user_first_name"],
                "user_father_name": row["user_father_name"],
                "user_family_name": row["user_family_name"],
                "user_full_name": row["user_full_name"],
                "user_branch_id": row["user_branch_id"],
                "user_branch_name": row["user_branch_name"],
                "user_status": row["user_status"],
                "user_role_code": row["user_role_code"],
                "user_role_name": row["user_role_name"],
                "requested_by_name": row["requested_by_name"],
                "assigned_hr_name": row["assigned_hr_name"],
            }
        )
        result.append(UserOnboardingRead.model_validate(data))
    return result


@router.patch("/hr/onboarding/{onboarding_id}/subject", response_model=UserRead)
async def patch_pending_onboarding_subject(
    onboarding_id: int,
    body: UserOnboardingSubjectUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("onboarding", "update"),
) -> UserRead:
    """Update subject user's name, branch, or org-level role while onboarding is pending."""
    from app.models.user_onboarding import UserOnboarding

    result = await db.execute(select(UserOnboarding).where(UserOnboarding.id == onboarding_id))
    onboarding_task = result.scalar_one_or_none()
    if not onboarding_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding task not found"
        )
    if not await _can_complete_onboarding(db, onboarding_task, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned onboarding reviewer can update this task",
        )

    old_user = await db.execute(select(User).where(User.id == onboarding_task.user_id))
    user_before = old_user.scalar_one_or_none()
    if not user_before:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    old_value = bootstrap_admin_protection.user_read_with_protection_flag(user_before).model_dump()

    user = await update_pending_onboarding_subject(db, onboarding_id=onboarding_id, body=body)
    await audit_service.log(
        session=db,
        action="onboarding.subject_updated",
        resource_type="user",
        resource_id=str(user.id),
        old_value=old_value,
        new_value=bootstrap_admin_protection.user_read_with_protection_flag(user).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(user)
    return bootstrap_admin_protection.user_read_with_protection_flag(user)


@router.post(
    "/hr/onboarding/{onboarding_id}/identity-document-image",
    response_model=IdentityDocumentImageResponse,
)
async def upload_onboarding_identity_document_image(
    onboarding_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("onboarding", "update"),
) -> IdentityDocumentImageResponse:
    """Upload a passport / national ID scan while onboarding is still pending."""
    from app.models.user_onboarding import UserOnboarding

    result = await db.execute(select(UserOnboarding).where(UserOnboarding.id == onboarding_id))
    onboarding_task = result.scalar_one_or_none()
    if not onboarding_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding task not found"
        )
    if not await _can_complete_onboarding(db, onboarding_task, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned onboarding reviewer can update this task",
        )
    raw = await file.read(settings.EMPLOYEE_IDENTITY_DOCUMENT_MAX_BYTES + 1)
    if len(raw) > settings.EMPLOYEE_IDENTITY_DOCUMENT_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Identity document file too large",
        )
    try:
        url = await save_onboarding_identity_document_image(
            db, onboarding_id=onboarding_id, file_body=raw
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc
    await db.commit()
    return IdentityDocumentImageResponse(image_url=url)


async def _can_complete_onboarding(db: AsyncSession, onboarding_task, current_user_id: int) -> bool:
    """Check if current user can update/complete the onboarding task.

    When assigned_hr_user_id is set, only that reviewer may act.
    Otherwise onboarding:update on the route is sufficient.
    """
    if onboarding_task.assigned_hr_user_id is not None:
        return onboarding_task.assigned_hr_user_id == current_user_id
    return True


@router.post("/hr/onboarding/{onboarding_id}/complete", response_model=UserOnboardingRead)
async def complete_onboarding(
    onboarding_id: int,
    body: UserOnboardingComplete,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("onboarding", "update"),
) -> UserOnboardingRead:
    # Fetch the onboarding task for authorization check
    from app.models.user_onboarding import UserOnboarding

    result = await db.execute(select(UserOnboarding).where(UserOnboarding.id == onboarding_id))
    onboarding_task = result.scalar_one_or_none()
    if not onboarding_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding task not found"
        )

    if not await _can_complete_onboarding(db, onboarding_task, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned onboarding reviewer can complete this task",
        )

    row = await complete_onboarding_task(
        db,
        onboarding_id=onboarding_id,
        actor_user_id=current_user.id,
        data=body.model_dump(exclude_unset=True),
    )
    await audit_service.log(
        session=db,
        action="onboarding.completed",
        resource_type="user_onboarding",
        resource_id=str(row.id),
        new_value=UserOnboardingRead.model_validate(row).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await emit_onboarding_nav_badges_invalidate()
    return UserOnboardingRead.model_validate(row)


@router.get(
    "/users/{user_id}/permission-overrides", response_model=list[UserPermissionOverrideRead]
)
async def list_permission_overrides(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("users", "read"),
) -> list[UserPermissionOverrideRead]:
    ures = await db.execute(select(User).where(User.id == user_id))
    target = ures.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    bootstrap_admin_protection.assert_bootstrap_admin_permission_overrides_forbidden(target)
    rows = await list_user_permission_overrides(db, user_id=user_id)
    return [UserPermissionOverrideRead.model_validate(r) for r in rows]


@router.put("/users/{user_id}/permission-overrides", response_model=UserPermissionOverrideRead)
async def upsert_permission_override_endpoint(
    user_id: int,
    body: UserPermissionOverrideWrite,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("users", "update"),
) -> UserPermissionOverrideRead:
    ures = await db.execute(select(User).where(User.id == user_id))
    target = ures.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    bootstrap_admin_protection.assert_bootstrap_admin_permission_overrides_forbidden(target)
    row = await upsert_user_permission_override(
        db,
        user_id=user_id,
        permission_id=body.permission_id,
        branch_id=body.branch_id,
        effect=body.effect,
        reason=body.reason,
        created_by_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="user.permission_override.upserted",
        resource_type="user_permission_override",
        resource_id=str(row.id),
        new_value=UserPermissionOverrideRead.model_validate(row).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return UserPermissionOverrideRead.model_validate(row)


@router.delete(
    "/users/{user_id}/permission-overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_permission_override_endpoint(
    user_id: int,
    override_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("users", "update"),
) -> None:
    ures = await db.execute(select(User).where(User.id == user_id))
    target = ures.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    bootstrap_admin_protection.assert_bootstrap_admin_permission_overrides_forbidden(target)
    await delete_user_permission_override(db, user_id=user_id, override_id=override_id)
    await audit_service.log(
        session=db,
        action="user.permission_override.deleted",
        resource_type="user_permission_override",
        resource_id=str(override_id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
