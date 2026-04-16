"""User lifecycle workflows: IT/HR onboarding and permission overrides."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.employee_profile import EmployeeProfile
from app.models.permission import Permission
from app.models.role import Role
from app.models.user_onboarding import UserOnboarding
from app.models.user_permission_override import UserPermissionOverride
from app.models.user_role import UserRole
from app.models.users import User


async def assign_role_by_code(db: AsyncSession, *, user_id: int, role_code: str) -> None:
    role_res = await db.execute(select(Role).where(Role.code == role_code.upper()))
    role = role_res.scalar_one_or_none()
    if not role:
        raise ValidationError("Role code not found", details={"role_code": role_code})
    existing = await db.execute(
        select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role_id == role.id,
            UserRole.branch_id.is_(None),
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(UserRole(user_id=user_id, role_id=role.id, branch_id=None))


async def ensure_onboarding_task(
    db: AsyncSession,
    *,
    user_id: int,
    requested_by_user_id: int | None,
    assigned_hr_user_id: int | None = None,
) -> UserOnboarding:
    existing = await db.execute(select(UserOnboarding).where(UserOnboarding.user_id == user_id))
    row = existing.scalar_one_or_none()
    if row:
        return row
    task = UserOnboarding(
        user_id=user_id,
        status="pending",
        requested_by_user_id=requested_by_user_id,
        assigned_hr_user_id=assigned_hr_user_id,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


async def list_onboarding_tasks(
    db: AsyncSession, *, status_filter: str | None = "pending"
) -> list[UserOnboarding]:
    stmt = select(UserOnboarding).order_by(UserOnboarding.created_at.asc())
    if status_filter:
        stmt = stmt.where(UserOnboarding.status == status_filter)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def complete_onboarding_task(
    db: AsyncSession,
    *,
    onboarding_id: int,
    actor_user_id: int,
    data: dict,
) -> UserOnboarding:
    result = await db.execute(select(UserOnboarding).where(UserOnboarding.id == onboarding_id))
    task = result.scalar_one_or_none()
    if not task:
        raise NotFoundError("Onboarding task not found", details={"onboarding_id": onboarding_id})
    if task.status == "completed":
        return task

    user_res = await db.execute(select(User).where(User.id == task.user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found", details={"user_id": task.user_id})

    for key, value in data.items():
        if value is not None:
            setattr(task, key, value)

    if task.contract_start is None:
        raise ValidationError("contract_start is required to complete onboarding")
    if task.salary_amount is None:
        raise ValidationError("salary_amount is required to complete onboarding")

    emp_res = await db.execute(select(EmployeeProfile).where(EmployeeProfile.user_id == user.id))
    employee = emp_res.scalar_one_or_none()
    if not employee:
        employee = EmployeeProfile(
            user_id=user.id,
            hire_date=task.contract_start,
            base_salary=task.salary_amount,
            hourly_rate=None,
            bank_account=None,
        )
        db.add(employee)
    else:
        employee.hire_date = task.contract_start
        employee.base_salary = task.salary_amount

    task.status = "completed"
    task.assigned_hr_user_id = (
        data.get("assigned_hr_user_id", task.assigned_hr_user_id) or actor_user_id
    )
    task.completed_at = datetime.now(UTC)
    user.status = "active"
    await db.flush()
    await db.refresh(task)
    return task


async def list_user_permission_overrides(
    db: AsyncSession,
    *,
    user_id: int,
) -> list[UserPermissionOverride]:
    result = await db.execute(
        select(UserPermissionOverride)
        .where(UserPermissionOverride.user_id == user_id)
        .order_by(UserPermissionOverride.created_at.desc())
    )
    return list(result.scalars().all())


async def upsert_user_permission_override(
    db: AsyncSession,
    *,
    user_id: int,
    permission_id: int,
    branch_id: int | None,
    effect: str,
    reason: str | None,
    created_by_user_id: int | None,
) -> UserPermissionOverride:
    if effect not in {"allow", "deny"}:
        raise ValidationError("effect must be allow or deny")

    user_res = await db.execute(select(User).where(User.id == user_id))
    if user_res.scalar_one_or_none() is None:
        raise NotFoundError("User not found", details={"user_id": user_id})

    perm_res = await db.execute(select(Permission).where(Permission.id == permission_id))
    if perm_res.scalar_one_or_none() is None:
        raise NotFoundError("Permission not found", details={"permission_id": permission_id})

    query = select(UserPermissionOverride).where(
        UserPermissionOverride.user_id == user_id,
        UserPermissionOverride.permission_id == permission_id,
    )
    if branch_id is None:
        query = query.where(UserPermissionOverride.branch_id.is_(None))
    else:
        query = query.where(UserPermissionOverride.branch_id == branch_id)
    result = await db.execute(query)
    override = result.scalar_one_or_none()
    if override is None:
        override = UserPermissionOverride(
            user_id=user_id,
            permission_id=permission_id,
            branch_id=branch_id,
            effect=effect,
            reason=reason,
            created_by_user_id=created_by_user_id,
        )
        db.add(override)
    else:
        override.effect = effect
        override.reason = reason
        override.created_by_user_id = created_by_user_id
    await db.flush()
    await db.refresh(override)
    return override


async def delete_user_permission_override(
    db: AsyncSession,
    *,
    user_id: int,
    override_id: int,
) -> None:
    result = await db.execute(
        select(UserPermissionOverride).where(
            UserPermissionOverride.id == override_id,
            UserPermissionOverride.user_id == user_id,
        )
    )
    override = result.scalar_one_or_none()
    if not override:
        raise NotFoundError("Permission override not found", details={"override_id": override_id})
    await db.delete(override)
