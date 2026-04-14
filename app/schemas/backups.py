"""Schemas for backup status and manual trigger endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class BackupStatusRead(BaseModel):
    success: bool
    started_at: str | None
    finished_at: str | None
    output_file: str | None
    message: str
    s3_uploaded: bool
