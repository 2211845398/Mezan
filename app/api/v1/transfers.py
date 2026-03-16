"""Transfer batches API (Epic 2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.transfers import TransferBatchCreate, TransferBatchRead
from app.services import audit_service
from app.services.transfer_service import (
    create_batch,
    dispatch_batch,
    get_batch,
    list_batches,
    receive_batch,
)

router = APIRouter()


@router.post("/transfers", response_model=TransferBatchRead, status_code=status.HTTP_201_CREATED)
async def create_transfer_batch_endpoint(
    body: TransferBatchCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> TransferBatchRead:
    batch = await create_batch(db, created_by_user_id=current_user.id, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="transfer_batch.created",
        resource_type="transfer_batch",
        resource_id=str(batch.id),
        new_value=TransferBatchRead.model_validate(batch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return TransferBatchRead.model_validate(batch)


@router.get("/transfers", response_model=list[TransferBatchRead])
async def list_transfer_batches_endpoint(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[TransferBatchRead]:
    rows = await list_batches(db, limit=limit, offset=offset)
    return [TransferBatchRead.model_validate(r) for r in rows]


@router.get("/transfers/{batch_id}", response_model=TransferBatchRead)
async def get_transfer_batch_endpoint(
    batch_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> TransferBatchRead:
    batch = await get_batch(db, batch_id)
    return TransferBatchRead.model_validate(batch)


@router.post("/transfers/{batch_id}/dispatch", response_model=TransferBatchRead)
async def dispatch_transfer_batch_endpoint(
    batch_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> TransferBatchRead:
    batch = await dispatch_batch(db, batch_id=batch_id)
    await audit_service.log(
        session=db,
        action="transfer_batch.dispatched",
        resource_type="transfer_batch",
        resource_id=str(batch.id),
        new_value=TransferBatchRead.model_validate(batch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return TransferBatchRead.model_validate(batch)


@router.post("/transfers/{batch_id}/receive", response_model=TransferBatchRead)
async def receive_transfer_batch_endpoint(
    batch_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> TransferBatchRead:
    batch = await receive_batch(db, batch_id=batch_id)
    await audit_service.log(
        session=db,
        action="transfer_batch.received",
        resource_type="transfer_batch",
        resource_id=str(batch.id),
        new_value=TransferBatchRead.model_validate(batch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return TransferBatchRead.model_validate(batch)

