"""CRUD and QR rotation for attendance kiosk devices."""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.attendance_device import AttendanceDevice
from app.models.branch import Branch
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.services.attendance_qr_service import build_signed_attendance_qr_payload
from app.utils.security import hash_password


async def list_attendance_devices(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
) -> list[AttendanceDevice]:
    q = select(AttendanceDevice).order_by(AttendanceDevice.id)
    if branch_id is not None:
        q = q.where(AttendanceDevice.branch_id == branch_id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_attendance_device(db: AsyncSession, device_id: int) -> AttendanceDevice:
    device = await db.get(AttendanceDevice, device_id)
    if device is None:
        raise NotFoundError("Attendance device not found", details={"device_id": device_id})
    return device


async def get_attendance_device_for_user(db: AsyncSession, user_id: int) -> AttendanceDevice:
    result = await db.execute(select(AttendanceDevice).where(AttendanceDevice.user_id == user_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise NotFoundError("No attendance device assigned to this user")
    return device


async def _generate_device_code(db: AsyncSession, *, branch_id: int) -> str:
    branch = await db.get(Branch, branch_id)
    if branch and branch.code:
        safe = re.sub(r"[^A-Z0-9]", "", branch.code.upper())[:12] or str(branch_id)
        prefix = f"KIOSK-{safe}"
    else:
        prefix = f"KIOSK-{branch_id}"
    for _ in range(32):
        code = f"{prefix}-{secrets.token_hex(3).upper()}"
        dup = await db.execute(select(AttendanceDevice).where(AttendanceDevice.device_code == code))
        if dup.scalar_one_or_none() is None:
            return code
    raise ConflictError("Could not generate unique device code")


async def create_attendance_device(
    db: AsyncSession,
    *,
    branch_id: int,
    name: str,
    device_code: str | None = None,
    user_id: int | None = None,
    kiosk_password: str | None = None,
    kiosk_email: str | None = None,
    kiosk_first_name: str | None = None,
    kiosk_family_name: str | None = None,
) -> AttendanceDevice:
    branch = await db.get(Branch, branch_id)
    if branch is None or not branch.is_active:
        raise ValidationError("Invalid branch")

    code = (device_code or "").strip()
    if not code:
        code = await _generate_device_code(db, branch_id=branch_id)
    else:
        dup = await db.execute(select(AttendanceDevice).where(AttendanceDevice.device_code == code))
        if dup.scalar_one_or_none() is not None:
            raise ConflictError("Device code already exists")

    resolved_user_id = await _resolve_kiosk_user_id(
        db,
        branch_id=branch_id,
        user_id=user_id,
        kiosk_email=kiosk_email,
        kiosk_password=kiosk_password,
        kiosk_first_name=kiosk_first_name or name.strip(),
        kiosk_family_name=kiosk_family_name,
        required=True,
    )
    await _assign_user_checks(db, user_id=resolved_user_id, branch_id=branch_id)
    await ensure_kiosk_role_for_user(db, user_id=resolved_user_id)

    device = AttendanceDevice(
        branch_id=branch_id,
        user_id=resolved_user_id,
        name=name.strip(),
        device_code=code,
        is_active=True,
        qr_token_version=1,
    )
    db.add(device)
    await db.flush()
    await db.refresh(device)
    return device


async def update_attendance_device(
    db: AsyncSession,
    *,
    device_id: int,
    data: dict,
) -> AttendanceDevice:
    device = await get_attendance_device(db, device_id)
    if "name" in data and data["name"] is not None:
        device.name = str(data["name"]).strip()
    if "branch_id" in data and data["branch_id"] is not None:
        branch = await db.get(Branch, data["branch_id"])
        if branch is None or not branch.is_active:
            raise ValidationError("Invalid branch")
        device.branch_id = int(data["branch_id"])
        device.qr_token_version += 1
    if "kiosk_email" in data and data["kiosk_email"] and device.user_id is not None:
        new_email = str(data["kiosk_email"]).strip().lower()
        user = await db.get(User, device.user_id)
        if user is not None and user.email != new_email:
            dup = await db.execute(select(User).where(User.email == new_email))
            if dup.scalar_one_or_none() is not None:
                raise ConflictError("Email already registered")
            user.email = new_email

    kiosk_account_touched = any(
        k in data
        for k in (
            "user_id",
            "kiosk_email",
            "kiosk_password",
            "kiosk_first_name",
            "kiosk_family_name",
        )
    )
    if kiosk_account_touched:
        explicit_user_id = data["user_id"] if "user_id" in data else device.user_id
        resolved_user_id = await _resolve_kiosk_user_id(
            db,
            branch_id=device.branch_id,
            user_id=explicit_user_id,
            kiosk_email=data.get("kiosk_email"),
            kiosk_password=data.get("kiosk_password"),
            kiosk_first_name=data.get("kiosk_first_name"),
            kiosk_family_name=data.get("kiosk_family_name"),
            required=False,
        )
        if resolved_user_id is not None:
            await _assign_user_checks(
                db,
                user_id=resolved_user_id,
                branch_id=device.branch_id,
                exclude_device_id=device.id,
            )
            await ensure_kiosk_role_for_user(db, user_id=resolved_user_id)
            device.user_id = resolved_user_id
    elif data.get("kiosk_password") and device.user_id is not None:
        await _ensure_kiosk_user_password(
            db, user_id=device.user_id, password=str(data["kiosk_password"])
        )
    if "is_active" in data and data["is_active"] is not None:
        device.is_active = bool(data["is_active"])
        if not device.is_active:
            device.qr_token_version += 1
    await db.flush()
    await db.refresh(device)
    return device


async def get_active_attendance_device_for_branch(
    db: AsyncSession,
    *,
    branch_id: int,
) -> AttendanceDevice:
    result = await db.execute(
        select(AttendanceDevice)
        .where(
            AttendanceDevice.branch_id == branch_id,
            AttendanceDevice.is_active.is_(True),
        )
        .order_by(AttendanceDevice.id)
        .limit(1)
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise NotFoundError(
            "No active attendance device for this branch",
            details={"branch_id": branch_id},
        )
    return device


async def request_fresh_attendance_qr_for_branch(
    db: AsyncSession,
    *,
    branch_id: int,
) -> AttendanceDevice:
    """Invalidate the current QR and prepare a new one for employee scan."""
    device = await get_active_attendance_device_for_branch(db, branch_id=branch_id)
    return await rotate_device_qr(db, device_id=device.id)


async def rotate_device_qr(db: AsyncSession, *, device_id: int) -> AttendanceDevice:
    device = await get_attendance_device(db, device_id)
    device.qr_token_version += 1
    await db.flush()
    await db.refresh(device)
    return device


async def current_qr_payload_for_device(db: AsyncSession, *, device: AttendanceDevice) -> str:
    if not device.is_active:
        raise ValidationError("Attendance device is inactive")
    device.last_seen_at = datetime.now(UTC)
    await db.flush()
    return build_signed_attendance_qr_payload(
        branch_id=device.branch_id,
        device_id=device.id,
        token_version=device.qr_token_version,
    )


async def _assign_user_checks(
    db: AsyncSession,
    *,
    user_id: int,
    branch_id: int,
    exclude_device_id: int | None = None,
) -> None:
    user = await db.get(User, user_id)
    if user is None or user.status != "active":
        raise ValidationError("Invalid kiosk user")

    taken = await db.execute(
        select(AttendanceDevice).where(AttendanceDevice.user_id == user_id)
    )
    existing = taken.scalar_one_or_none()
    if existing is not None and existing.id != exclude_device_id:
        raise ConflictError("User is already assigned to another attendance device")

    if user.branch_id is None:
        user.branch_id = branch_id
    elif user.branch_id != branch_id:
        raise ValidationError("Kiosk user branch must match device branch")


async def _ensure_kiosk_user_password(db: AsyncSession, *, user_id: int, password: str) -> None:
    user = await db.get(User, user_id)
    if user is None:
        raise ValidationError("Invalid kiosk user")
    user.password_hash = hash_password(password)


async def list_kiosk_user_candidates(
    db: AsyncSession,
    *,
    branch_id: int,
    exclude_device_id: int | None = None,
) -> list[dict[str, object]]:
    """Active ATTENDANCE_KIOSK users on the branch not linked to another device."""
    res_role = await db.execute(select(Role).where(Role.code == "ATTENDANCE_KIOSK"))
    kiosk_role = res_role.scalar_one_or_none()
    if kiosk_role is None:
        return []

    assigned = await db.execute(
        select(AttendanceDevice.user_id, AttendanceDevice.id).where(
            AttendanceDevice.user_id.is_not(None)
        )
    )
    taken_by_user: dict[int, int] = {
        uid: did for uid, did in assigned.all() if uid is not None
    }

    stmt = (
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .where(
            UserRole.role_id == kiosk_role.id,
            User.status == "active",
            User.branch_id == branch_id,
        )
        .order_by(User.email.asc())
    )
    result = await db.execute(stmt)
    out: list[dict[str, object]] = []
    for user in result.scalars().unique().all():
        assigned_device_id = taken_by_user.get(user.id)
        if assigned_device_id is not None and assigned_device_id != exclude_device_id:
            continue
        out.append(
            {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "family_name": user.family_name,
                "branch_id": user.branch_id,
            }
        )
    return out


async def _resolve_kiosk_user_id(
    db: AsyncSession,
    *,
    branch_id: int,
    user_id: int | None,
    kiosk_email: str | None,
    kiosk_password: str | None,
    kiosk_first_name: str | None,
    kiosk_family_name: str | None,
    required: bool,
) -> int | None:
    if user_id is not None:
        if kiosk_password:
            await _ensure_kiosk_user_password(db, user_id=user_id, password=kiosk_password)
        return user_id

    email = (kiosk_email or "").strip().lower()
    if email:
        if not kiosk_password or len(kiosk_password) < 8:
            raise ValidationError("kiosk_password must be at least 8 characters")
        first = (kiosk_first_name or "").strip() or email.split("@")[0]
        family = (kiosk_family_name or "").strip() or None
        return await _create_kiosk_user(
            db,
            branch_id=branch_id,
            email=email,
            password=kiosk_password,
            first_name=first,
            family_name=family,
        )

    if required:
        raise ValidationError("Kiosk account is required (user_id or kiosk_email)")
    return None


async def _create_kiosk_user(
    db: AsyncSession,
    *,
    branch_id: int,
    email: str,
    password: str,
    first_name: str,
    family_name: str | None,
) -> int:
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise ConflictError("Email already registered")

    user = User(
        email=email,
        first_name=first_name,
        father_name=None,
        family_name=family_name,
        password_hash=hash_password(password),
        status="active",
        branch_id=branch_id,
        preferred_language="en",
    )
    db.add(user)
    await db.flush()
    await ensure_kiosk_role_for_user(db, user_id=user.id)
    branch_role = await db.execute(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.branch_id == branch_id)
    )
    if branch_role.scalar_one_or_none() is None:
        res_role = await db.execute(select(Role).where(Role.code == "ATTENDANCE_KIOSK"))
        role = res_role.scalar_one()
        db.add(UserRole(user_id=user.id, role_id=role.id, branch_id=branch_id))
        await db.flush()
    return user.id


async def ensure_kiosk_role_for_user(db: AsyncSession, *, user_id: int) -> None:
    res = await db.execute(select(Role).where(Role.code == "ATTENDANCE_KIOSK"))
    role = res.scalar_one_or_none()
    if role is None:
        return
    has = await db.execute(
        select(UserRole).where(UserRole.user_id == user_id, UserRole.role_id == role.id)
    )
    if has.scalar_one_or_none() is None:
        db.add(UserRole(user_id=user_id, role_id=role.id, branch_id=None))
        await db.flush()
