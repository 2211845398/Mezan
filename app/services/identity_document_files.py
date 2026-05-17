"""Persist HR identity document scans (JPEG/PNG/WebP) under the static uploads root."""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.core.errors import ValidationError
from app.utils.image_format import detect_raster_image_extension


def persist_raster_identity_scan(*, basename: str, file_body: bytes) -> str:
    """Validate raster bytes, write ``{basename}.{ext}`` under the identity upload dir, return public URL path."""
    if len(file_body) > settings.EMPLOYEE_IDENTITY_DOCUMENT_MAX_BYTES:
        raise ValidationError(
            "Identity document file too large",
            details={"max_bytes": settings.EMPLOYEE_IDENTITY_DOCUMENT_MAX_BYTES},
        )
    ext = detect_raster_image_extension(file_body[:64])
    if ext is None:
        raise ValidationError(
            "Identity document must be JPEG, PNG, or WebP",
            details={"code": "identity_document_invalid_image"},
        )
    root = Path(settings.EMPLOYEE_IDENTITY_DOCUMENT_UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    for old in root.glob(f"{basename}.*"):
        try:
            old.unlink()
        except OSError:
            pass
    dest = root / f"{basename}.{ext}"
    dest.write_bytes(file_body)
    return f"/api/v1/static/employee-identity-documents/{basename}.{ext}"
