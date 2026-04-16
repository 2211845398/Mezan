"""Automated PostgreSQL backup service with local retention and optional S3 upload."""

from __future__ import annotations

import asyncio
import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.core.config import settings

STATUS_FILE = "last_backup_status.json"


@dataclass
class BackupStatus:
    success: bool
    started_at: str
    finished_at: str | None
    output_file: str | None
    message: str
    s3_uploaded: bool = False


def _backup_dir() -> Path:
    backup_dir = Path(settings.BACKUP_OUTPUT_DIR)
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _status_path() -> Path:
    return _backup_dir() / STATUS_FILE


def _write_status(status: BackupStatus) -> None:
    _status_path().write_text(json.dumps(asdict(status), indent=2), encoding="utf-8")


def read_backup_status() -> dict:
    path = _status_path()
    if not path.exists():
        return {
            "success": False,
            "started_at": None,
            "finished_at": None,
            "output_file": None,
            "message": "No backup has run yet",
            "s3_uploaded": False,
        }
    return json.loads(path.read_text(encoding="utf-8"))


def _upload_to_s3(file_path: Path) -> bool:
    if not settings.BACKUP_S3_BUCKET:
        return False
    try:
        import boto3

        client = boto3.client("s3")
        key = f"db-backups/{file_path.name}"
        client.upload_file(str(file_path), settings.BACKUP_S3_BUCKET, key)
        return True
    except Exception:
        return False


def _prune_local_backups() -> None:
    retention_cutoff = datetime.now(UTC) - timedelta(days=settings.BACKUP_RETENTION_DAYS)
    for file_path in _backup_dir().glob("*.dump"):
        if datetime.fromtimestamp(file_path.stat().st_mtime, tz=UTC) < retention_cutoff:
            file_path.unlink(missing_ok=True)


def run_backup_once() -> dict:
    started_at = datetime.now(UTC)
    status = BackupStatus(
        success=False,
        started_at=started_at.isoformat(),
        finished_at=None,
        output_file=None,
        message="Backup started",
        s3_uploaded=False,
    )
    _write_status(status)

    timestamp = started_at.strftime("%Y%m%d_%H%M%S")
    output_file = _backup_dir() / f"mezan_{timestamp}.dump"
    db_url = settings.DATABASE_URL.replace("+asyncpg", "")
    cmd = [
        "pg_dump",
        "--format=custom",
        "--file",
        str(output_file),
        db_url,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        status.success = False
        status.finished_at = datetime.now(UTC).isoformat()
        status.output_file = None
        status.message = result.stderr.strip() or "pg_dump failed"
        _write_status(status)
        return asdict(status)

    uploaded = _upload_to_s3(output_file)
    _prune_local_backups()

    status.success = True
    status.finished_at = datetime.now(UTC).isoformat()
    status.output_file = str(output_file)
    status.message = "Backup completed"
    status.s3_uploaded = uploaded
    _write_status(status)
    return asdict(status)


async def run_backup_once_async() -> dict:
    return await asyncio.to_thread(run_backup_once)


async def backup_scheduler_loop(stop_event: asyncio.Event) -> None:
    interval_seconds = max(settings.BACKUP_INTERVAL_MINUTES, 1) * 60
    while not stop_event.is_set():
        if settings.BACKUP_ENABLED:
            await run_backup_once_async()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except TimeoutError:
            continue
