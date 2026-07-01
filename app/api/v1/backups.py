"""Administrative backup APIs for status, history, manual execution, and download."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.backups import BackupFileRead, BackupHistoryRead, BackupStatusRead
from app.services import audit_service
from app.services.backup_service import (
    list_backup_files,
    read_backup_status,
    run_backup_once_async,
    safe_backup_file_path,
)

router = APIRouter()


@router.get("/admin/backups/status", response_model=BackupStatusRead)
async def get_backup_status(
    _: None = Depends(get_current_user),
    __: None = require_permission("backups", "read"),
) -> BackupStatusRead:
    return BackupStatusRead.model_validate(read_backup_status())


@router.get("/admin/backups/history", response_model=BackupHistoryRead)
async def get_backup_history(
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: None = Depends(get_current_user),
    __: None = require_permission("backups", "read"),
) -> BackupHistoryRead:
    """List backup files with pagination."""
    result = list_backup_files(limit=limit, offset=offset)
    items = [BackupFileRead.model_validate(item) for item in result["items"]]
    return BackupHistoryRead(
        items=items,
        total=result["total"],
        limit=result["limit"],
        offset=result["offset"],
    )


@router.get("/admin/backups/{filename}/download")
async def download_backup(
    filename: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("backups", "read"),
) -> FileResponse:
    """Download a backup file securely."""
    file_path = safe_backup_file_path(filename)

    # Log the download attempt
    await audit_service.log(
        session=db,
        action="backup.downloaded",
        resource_type="backup_file",
        resource_id=filename,
        new_value={"size_bytes": file_path.stat().st_size},
        user_id=current_user.id,
        branch_id=current_user.branch_id,
        request=request,
    )
    await db.commit()

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream",
    )


@router.post(
    "/admin/backups/run", response_model=BackupStatusRead, status_code=status.HTTP_202_ACCEPTED
)
async def run_backup(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("backups", "run"),
) -> BackupStatusRead:
    result = await run_backup_once_async()
    await audit_service.log(
        session=db,
        action="backup.manual_run",
        resource_type="backup_job",
        resource_id="manual",
        new_value=result,
        user_id=current_user.id,
        branch_id=current_user.branch_id,
        request=request,
    )
    await db.commit()
    return BackupStatusRead.model_validate(result)
