"""Administrative backup APIs for status and manual execution."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.backups import BackupStatusRead
from app.services import audit_service
from app.services.backup_service import read_backup_status, run_backup_once_async

router = APIRouter()


@router.get("/admin/backups/status", response_model=BackupStatusRead)
async def get_backup_status(
    _: None = Depends(get_current_user),
    __: None = require_permission("backups", "read"),
) -> BackupStatusRead:
    return BackupStatusRead.model_validate(read_backup_status())


@router.post("/admin/backups/run", response_model=BackupStatusRead, status_code=status.HTTP_202_ACCEPTED)
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
        request=request,
    )
    await db.commit()
    return BackupStatusRead.model_validate(result)
