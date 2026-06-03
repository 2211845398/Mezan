"""User lifecycle workflows: IT/HR onboarding and permission overrides."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.employee_profile import EmployeeProfile
from app.models.permission import Permission
from app.models.role import Role
from app.models.user_onboarding import UserOnboarding
from app.models.user_permission_override import UserPermissionOverride
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.schemas.users import UserOnboardingSubjectUpdate
from app.services.identity_document_files import persist_raster_identity_scan
from app.utils.person_name import person_name_sql_expr


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


async def list_onboarding_tasks_enriched(
    db: AsyncSession, *, status_filter: str | None = "pending"
) -> list[dict]:
    """Return onboarding tasks with enriched user, branch, and role details."""
    from app.models.branch import Branch as BranchModel
    from app.models.role import Role as RoleModel
    from app.models.user_role import UserRole as UserRoleModel
    from app.models.users import User as UserModel

    stmt = (
        select(
            UserOnboarding,
            UserModel.email.label("user_email"),
            UserModel.first_name.label("user_first_name"),
            UserModel.father_name.label("user_father_name"),
            UserModel.family_name.label("user_family_name"),
            person_name_sql_expr(
                UserModel.first_name, UserModel.father_name, UserModel.family_name
            ).label("user_full_name"),
            UserModel.branch_id.label("user_branch_id"),
            UserModel.status.label("user_status"),
            BranchModel.name.label("user_branch_name"),
            RoleModel.code.label("user_role_code"),
            RoleModel.name.label("user_role_name"),
        )
        .join(UserModel, UserOnboarding.user_id == UserModel.id)
        .outerjoin(BranchModel, UserModel.branch_id == BranchModel.id)
        .outerjoin(
            UserRoleModel,
            (UserRoleModel.user_id == UserOnboarding.user_id) & (UserRoleModel.branch_id.is_(None)),
        )
        .outerjoin(RoleModel, UserRoleModel.role_id == RoleModel.id)
        .order_by(UserOnboarding.created_at.asc())
    )
    if status_filter:
        stmt = stmt.where(UserOnboarding.status == status_filter)
    # HR "pending" queue is only for accounts still awaiting onboarding, not deactivated/etc.
    if status_filter == "pending":
        stmt = stmt.where(UserModel.status == "pending_onboarding")

    result = await db.execute(stmt)
    rows = result.all()

    # Get requester and assignee names
    user_ids = set()
    for row in rows:
        onboarding = row[0]
        if onboarding.requested_by_user_id:
            user_ids.add(onboarding.requested_by_user_id)
        if onboarding.assigned_hr_user_id:
            user_ids.add(onboarding.assigned_hr_user_id)

    names_map: dict[int, str] = {}
    if user_ids:
        user_result = await db.execute(
            select(
                UserModel.id,
                person_name_sql_expr(
                    UserModel.first_name, UserModel.father_name, UserModel.family_name
                ),
            ).where(UserModel.id.in_(list(user_ids)))
        )
        names_map = {uid: (str(n).strip() if n else None) for uid, n in user_result.all()}

    enriched = []
    for row in rows:
        onboarding = row[0]
        enriched.append(
            {
                "onboarding": onboarding,
                "user_email": row.user_email,
                "user_first_name": row.user_first_name,
                "user_father_name": row.user_father_name,
                "user_family_name": row.user_family_name,
                "user_full_name": row.user_full_name,
                "user_branch_id": row.user_branch_id,
                "user_status": row.user_status,
                "user_branch_name": row.user_branch_name,
                "user_role_code": row.user_role_code,
                "user_role_name": row.user_role_name,
                "requested_by_name": names_map.get(onboarding.requested_by_user_id),
                "assigned_hr_name": names_map.get(onboarding.assigned_hr_user_id),
            }
        )

    return enriched


async def complete_onboarding_task(
    db: AsyncSession,
    *,
    onboarding_id: int,
    actor_user_id: int,
    data: dict,
) -> UserOnboarding:
    from datetime import time as dt_time

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

    if "assigned_hr_user_id" in data:
        aid = data.get("assigned_hr_user_id")
        if aid is not None:
            from app.services.effective_permissions import user_can_act_as_onboarding_assignee

            if not await user_can_act_as_onboarding_assignee(db, int(aid)):
                raise ValidationError(
                    "Invalid onboarding assignee",
                    details={"code": "onboarding_assignee_ineligible"},
                )

    # Update task fields from data (image URL is set only via upload endpoint)
    skip_keys = ("schedules", "hourly_rate", "bank_account", "identity_document_image_url")
    for key, value in data.items():
        if value is not None and key not in skip_keys:
            setattr(task, key, value)

    if task.contract_start is None:
        raise ValidationError("contract_start is required to complete onboarding")

    if task.contract_end is not None and task.contract_end < task.contract_start:
        raise ValidationError(
            "contract_end must be on or after contract_start",
            details={"code": "contract_end_before_start"},
        )

    # Either salary_amount or hourly_rate must be provided
    salary_amount = data.get("salary_amount") or task.salary_amount
    hourly_rate = data.get("hourly_rate")
    if salary_amount is None and hourly_rate is None:
        raise ValidationError(
            "Either salary_amount or hourly_rate is required to complete onboarding"
        )

    emp_res = await db.execute(select(EmployeeProfile).where(EmployeeProfile.user_id == user.id))
    employee = emp_res.scalar_one_or_none()
    if not employee:
        employee = EmployeeProfile(
            user_id=user.id,
            hire_date=task.contract_start,
            base_salary=salary_amount,
            hourly_rate=hourly_rate,
            bank_account=data.get("bank_account"),
        )
        db.add(employee)
    else:
        employee.hire_date = task.contract_start
        employee.base_salary = salary_amount
        if hourly_rate is not None:
            employee.hourly_rate = hourly_rate
        if data.get("bank_account") is not None:
            employee.bank_account = data.get("bank_account")

    employee.identity_document_type = task.identity_document_type
    employee.identity_document_number = task.identity_document_number
    employee.identity_document_image_url = task.identity_document_image_url

    await db.flush()

    # Create schedules if provided
    schedules = data.get("schedules")
    if schedules and isinstance(schedules, list):
        for sched in schedules:
            weekday = sched.get("weekday")
            start_time_str = sched.get("start_time", "09:00:00")
            end_time_str = sched.get("end_time", "17:00:00")
            is_day_off = sched.get("is_day_off", False)
            branch_id = sched.get("branch_id")

            # Parse time strings
            start_parts = start_time_str.split(":")
            end_parts = end_time_str.split(":")
            start_time = dt_time(
                int(start_parts[0]), int(start_parts[1]) if len(start_parts) > 1 else 0
            )
            end_time = dt_time(int(end_parts[0]), int(end_parts[1]) if len(end_parts) > 1 else 0)

            schedule = WeeklySchedule(
                employee_profile_id=employee.id,
                branch_id=branch_id,
                weekday=weekday,
                start_time=start_time,
                end_time=end_time,
                is_day_off=is_day_off,
            )
            db.add(schedule)

    task.status = "completed"
    task.assigned_hr_user_id = (
        data.get("assigned_hr_user_id", task.assigned_hr_user_id) or actor_user_id
    )
    task.salary_amount = salary_amount
    task.completed_at = datetime.now(UTC)
    user.status = "active"
    await db.flush()
    await db.refresh(task)
    return task


async def update_pending_onboarding_subject(
    db: AsyncSession,
    *,
    onboarding_id: int,
    body: UserOnboardingSubjectUpdate,
) -> User:
    """Apply name/branch/org-level role edits for a user still in pending_onboarding."""
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        raise ValidationError("No fields to update", details={"code": "empty_update"})

    result = await db.execute(select(UserOnboarding).where(UserOnboarding.id == onboarding_id))
    task = result.scalar_one_or_none()
    if not task:
        raise NotFoundError("Onboarding task not found", details={"onboarding_id": onboarding_id})
    if task.status != "pending":
        raise ValidationError(
            "Onboarding task is not pending",
            details={"onboarding_id": onboarding_id, "status": task.status},
        )

    user_res = await db.execute(select(User).where(User.id == task.user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found", details={"user_id": task.user_id})
    if user.status != "pending_onboarding":
        raise ValidationError(
            "User account is not pending onboarding",
            details={"user_id": user.id, "status": user.status},
        )

    for field, col in (
        ("first_name", "first_name"),
        ("father_name", "father_name"),
        ("family_name", "family_name"),
    ):
        if field in payload:
            v = payload[field]
            setattr(user, col, v.strip() if isinstance(v, str) and v.strip() else None)

    if "branch_id" in payload:
        user.branch_id = payload["branch_id"]

    if "role_code" in payload:
        raw = (payload["role_code"] or "").strip().upper()
        if not raw:
            raise ValidationError("role_code cannot be empty", details={"code": "role_required"})
        role_res = await db.execute(select(Role).where(Role.code == raw))
        role = role_res.scalar_one_or_none()
        if not role:
            raise ValidationError("Role code not found", details={"role_code": raw})
        await db.execute(
            delete(UserRole).where(
                UserRole.user_id == user.id,
                UserRole.branch_id.is_(None),
            ),
        )
        db.add(UserRole(user_id=user.id, role_id=role.id, branch_id=None))

    await db.flush()
    await db.refresh(user)
    return user


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


async def save_onboarding_identity_document_image(
    db: AsyncSession, *, onboarding_id: int, file_body: bytes
) -> str:
    """Store a passport/ID scan for a pending onboarding task; returns public static URL path."""

    result = await db.execute(select(UserOnboarding).where(UserOnboarding.id == onboarding_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise NotFoundError("Onboarding task not found", details={"onboarding_id": onboarding_id})
    if (task.status or "").strip().lower() != "pending":
        raise ValidationError(
            "Onboarding task is not pending",
            details={"onboarding_id": onboarding_id, "status": task.status},
        )
    url = persist_raster_identity_scan(basename=f"onboarding-{onboarding_id}", file_body=file_body)
    task.identity_document_image_url = url
    await db.flush()
    await db.refresh(task)
    return url
