"""Schemas for backup status, history, and download endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BackupStatusRead(BaseModel):
    success: bool
    started_at: str | None
    finished_at: str | None
    output_file: str | None
    message: str
    s3_uploaded: bool


class BackupFileRead(BaseModel):
    """Single backup file metadata."""

    filename: str = Field(description="Backup file name without path")
    started_at: str | None = Field(description="ISO timestamp when backup started")
    finished_at: str | None = Field(description="ISO timestamp when backup completed")
    size_bytes: int = Field(description="File size in bytes", ge=0)
    size_label: str = Field(description="Human-readable size (e.g., '256 MB')")
    success: bool = Field(description="Whether backup completed successfully")
    s3_uploaded: bool = Field(description="Whether file was uploaded to S3")
    message: str = Field(default="", description="Status message or error")


class BackupHistoryRead(BaseModel):
    """List of backup files."""

    items: list[BackupFileRead] = Field(default_factory=list)
    total: int = Field(description="Total number of backup files")
    limit: int = Field(default=100, description="Maximum items returned")
    offset: int = Field(default=0, description="Offset for pagination")
