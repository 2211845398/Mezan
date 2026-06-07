"""Attendance kiosk device management and QR display APIs."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.attendance_device import AttendanceDevice
from app.models.branch import Branch
from app.models.users import User
from app.schemas.attendance_device import (
    AttendanceDeviceCreate,
    AttendanceDeviceRead,
    AttendanceDeviceUpdate,
    AttendanceQrPayloadRead,
    KioskUserCandidateRead,
)
from app.services import audit_service
from app.services.attendance_device_service import (
    create_attendance_device,
    current_qr_payload_for_device,
    ensure_kiosk_role_for_user,
    get_attendance_device,
    get_attendance_device_for_user,
    list_attendance_devices,
    list_kiosk_user_candidates,
    rotate_device_qr,
    update_attendance_device,
)
from app.services.attendance_qr_service import QR_TTL_SECONDS

router = APIRouter()


def _enrich_device(
    device: AttendanceDevice,
    *,
    branch_name: str | None = None,
    user_email: str | None = None,
) -> AttendanceDeviceRead:
    payload = AttendanceDeviceRead.model_validate(device).model_dump()
    payload["branch_name"] = branch_name
    payload["user_email"] = user_email
    return AttendanceDeviceRead.model_validate(payload)


@router.get("/attendance-devices", response_model=list[AttendanceDeviceRead])
async def list_devices_endpoint(
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("attendance_devices", "read"),
) -> list[AttendanceDeviceRead]:
    devices = await list_attendance_devices(db, branch_id=branch_id)
    out: list[AttendanceDeviceRead] = []
    for device in devices:
        branch = await db.get(Branch, device.branch_id)
        user_email = None
        if device.user_id is not None:
            user = await db.get(User, device.user_id)
            user_email = user.email if user else None
        out.append(
            _enrich_device(
                device,
                branch_name=branch.name if branch else None,
                user_email=user_email,
            )
        )
    return out


@router.post(
    "/attendance-devices",
    response_model=AttendanceDeviceRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_device_endpoint(
    body: AttendanceDeviceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("attendance_devices", "create"),
) -> AttendanceDeviceRead:
    device = await create_attendance_device(
        db,
        branch_id=body.branch_id,
        name=body.name,
        device_code=body.device_code,
        user_id=body.user_id,
        kiosk_password=body.kiosk_password,
        kiosk_email=body.kiosk_email,
        kiosk_first_name=body.kiosk_first_name,
        kiosk_family_name=body.kiosk_family_name,
    )
    await audit_service.log(
        session=db,
        action="attendance_device.created",
        resource_type="attendance_device",
        resource_id=str(device.id),
        new_value=AttendanceDeviceRead.model_validate(device).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(device)
    branch = await db.get(Branch, device.branch_id)
    user_email = None
    if device.user_id is not None:
        user = await db.get(User, device.user_id)
        user_email = user.email if user else None
    return _enrich_device(
        device,
        branch_name=branch.name if branch else None,
        user_email=user_email,
    )


@router.get(
    "/attendance-devices/kiosk-user-candidates",
    response_model=list[KioskUserCandidateRead],
)
async def kiosk_user_candidates_endpoint(
    branch_id: int,
    exclude_device_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("attendance_devices", "read"),
) -> list[KioskUserCandidateRead]:
    rows = await list_kiosk_user_candidates(
        db,
        branch_id=branch_id,
        exclude_device_id=exclude_device_id,
    )
    return [KioskUserCandidateRead.model_validate(r) for r in rows]


@router.patch("/attendance-devices/{device_id}", response_model=AttendanceDeviceRead)
async def update_device_endpoint(
    device_id: int,
    body: AttendanceDeviceUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("attendance_devices", "update"),
) -> AttendanceDeviceRead:
    old = await get_attendance_device(db, device_id)
    old_value = AttendanceDeviceRead.model_validate(old).model_dump()
    device = await update_attendance_device(
        db,
        device_id=device_id,
        data=body.model_dump(exclude_unset=True),
    )
    await audit_service.log(
        session=db,
        action="attendance_device.updated",
        resource_type="attendance_device",
        resource_id=str(device.id),
        old_value=old_value,
        new_value=AttendanceDeviceRead.model_validate(device).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(device)
    branch = await db.get(Branch, device.branch_id)
    user_email = None
    if device.user_id is not None:
        user = await db.get(User, device.user_id)
        user_email = user.email if user else None
    return _enrich_device(
        device,
        branch_name=branch.name if branch else None,
        user_email=user_email,
    )


@router.post("/attendance-devices/{device_id}/rotate-qr", response_model=AttendanceDeviceRead)
async def rotate_qr_endpoint(
    device_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("attendance_devices", "update"),
) -> AttendanceDeviceRead:
    device = await rotate_device_qr(db, device_id=device_id)
    await audit_service.log(
        session=db,
        action="attendance_device.qr_rotated",
        resource_type="attendance_device",
        resource_id=str(device.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(device)
    return AttendanceDeviceRead.model_validate(device)


@router.get("/attendance-devices/{device_id}/qr", response_model=AttendanceQrPayloadRead)
async def preview_qr_endpoint(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("attendance_devices", "read"),
) -> AttendanceQrPayloadRead:
    device = await get_attendance_device(db, device_id)
    payload = await current_qr_payload_for_device(db, device=device)
    await db.commit()
    return AttendanceQrPayloadRead(
        qr_payload=payload,
        expires_in_seconds=QR_TTL_SECONDS,
        branch_id=device.branch_id,
        device_id=device.id,
    )


@router.get("/attendance-devices/me/qr", response_model=AttendanceQrPayloadRead)
async def kiosk_qr_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("attendance_kiosk", "read"),
) -> AttendanceQrPayloadRead:
    device = await get_attendance_device_for_user(db, user_id=current_user.id)
    payload = await current_qr_payload_for_device(db, device=device)
    await db.commit()
    return AttendanceQrPayloadRead(
        qr_payload=payload,
        expires_in_seconds=QR_TTL_SECONDS,
        branch_id=device.branch_id,
        device_id=device.id,
    )
