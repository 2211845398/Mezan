"""Parse and validate branch attendance QR payloads for mobile self-service."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ValidationError
from app.models.attendance_device import AttendanceDevice
from app.models.branch import Branch

QR_PREFIX = "mezan:attendance:v1:branch:"
QR_V2_PREFIX = "mezan:attendance:v2:"
QR_TTL_SECONDS = 90


@dataclass(frozen=True)
class ResolvedAttendanceQr:
    branch_id: int
    device_id: int | None


def build_signed_attendance_qr_payload(
    *,
    branch_id: int,
    device_id: int,
    token_version: int,
    ttl_seconds: int = QR_TTL_SECONDS,
) -> str:
    exp = int(time.time()) + ttl_seconds
    payload = {
        "type": "attendance",
        "branch_id": branch_id,
        "device_id": device_id,
        "ver": token_version,
        "exp": exp,
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    sig = _sign_payload(raw)
    return f"{QR_V2_PREFIX}{raw}.{sig}"


async def resolve_branch_from_qr_payload(
    db: AsyncSession,
    qr_payload: str | None,
    *,
    fallback_branch_id: int | None = None,
) -> int:
    """Return a validated branch id from a scanned QR payload."""
    resolved = await resolve_attendance_qr_payload(
        db,
        qr_payload,
        fallback_branch_id=fallback_branch_id,
    )
    return resolved.branch_id


async def resolve_attendance_qr_payload(
    db: AsyncSession,
    qr_payload: str | None,
    *,
    fallback_branch_id: int | None = None,
) -> ResolvedAttendanceQr:
    """Return validated branch and device ids from a scanned QR payload."""
    if qr_payload is None or not qr_payload.strip():
        if fallback_branch_id is not None:
            branch_id = fallback_branch_id
            device_id = None
        else:
            raise ValidationError("QR payload is required")
    else:
        raw = qr_payload.strip()
        branch_id, device_id = await _parse_and_validate_payload(db, raw)

    branch = await db.get(Branch, branch_id)
    if branch is None or not branch.is_active:
        raise ValidationError("Invalid attendance QR code")
    return ResolvedAttendanceQr(branch_id=branch_id, device_id=device_id)


async def _parse_and_validate_payload(db: AsyncSession, raw: str) -> tuple[int, int | None]:
    if raw.startswith(QR_V2_PREFIX):
        return await _parse_v2_signed(db, raw[len(QR_V2_PREFIX) :])
    branch_id = _parse_branch_id(raw)
    if branch_id is None:
        raise ValidationError("Invalid attendance QR code")
    return branch_id, None


async def _parse_v2_signed(db: AsyncSession, body: str) -> tuple[int, int]:
    if "." not in body:
        raise ValidationError("Invalid attendance QR code")
    encoded, sig = body.rsplit(".", 1)
    if not hmac.compare_digest(_sign_payload(encoded), sig):
        raise ValidationError("Invalid attendance QR code")
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded.encode()).decode())
    except (json.JSONDecodeError, ValueError):
        raise ValidationError("Invalid attendance QR code") from None
    if not isinstance(payload, dict) or payload.get("type") != "attendance":
        raise ValidationError("Invalid attendance QR code")
    try:
        branch_id = int(payload["branch_id"])
        device_id = int(payload["device_id"])
        token_version = int(payload["ver"])
        exp = int(payload["exp"])
    except (TypeError, ValueError, KeyError):
        raise ValidationError("Invalid attendance QR code") from None
    if exp < int(time.time()):
        raise ValidationError("Attendance QR code has expired")

    device = await db.get(AttendanceDevice, device_id)
    if (
        device is None
        or not device.is_active
        or device.branch_id != branch_id
        or device.qr_token_version != token_version
    ):
        raise ValidationError("Invalid attendance QR code")
    return branch_id, device_id


def _sign_payload(encoded: str) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.encode(),
        encoded.encode(),
        hashlib.sha256,
    ).hexdigest()
    return digest[:32]


def _parse_branch_id(raw: str) -> int | None:
    if raw.startswith(QR_PREFIX):
        try:
            return int(raw[len(QR_PREFIX) :])
        except ValueError:
            return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or parsed.get("type") != "attendance":
        return None
    try:
        return int(parsed["branch_id"])
    except (TypeError, ValueError, KeyError):
        return None
