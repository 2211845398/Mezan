"""POS shift management APIs."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.pos_shift import (
    PosShiftCashEventRequest,
    PosShiftCloseRequest,
    PosShiftOpenRequest,
    PosShiftRead,
)
from app.services import audit_service
from app.services.shift_service import add_cash_event, close_shift, open_shift

router = APIRouter()


@router.post("/pos/shifts/open", response_model=PosShiftRead, status_code=status.HTTP_201_CREATED)
async def open_shift_endpoint(
    body: PosShiftOpenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_shifts", "open"),
) -> PosShiftRead:
    shift = await open_shift(
        db,
        terminal_id=body.terminal_id,
        opening_float=body.opening_float,
        opened_by_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="pos_shift.opened",
        resource_type="pos_shift",
        resource_id=str(shift.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PosShiftRead.model_validate(shift)


@router.post("/pos/shifts/{shift_id}/cash-events", response_model=PosShiftRead)
async def add_cash_event_endpoint(
    shift_id: int,
    body: PosShiftCashEventRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_shifts", "update"),
) -> PosShiftRead:
    shift = await add_cash_event(
        db,
        shift_id=shift_id,
        event_type=body.event_type,
        amount=body.amount,
        note=body.note,
        created_by_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="pos_shift.cash_event_added",
        resource_type="pos_shift",
        resource_id=str(shift.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PosShiftRead.model_validate(shift)


@router.post("/pos/shifts/{shift_id}/close", response_model=PosShiftRead)
async def close_shift_endpoint(
    shift_id: int,
    body: PosShiftCloseRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_shifts", "close"),
) -> PosShiftRead:
    shift = await close_shift(
        db, shift_id=shift_id, declared_cash=body.declared_cash, closed_by_user_id=current_user.id
    )
    await audit_service.log(
        session=db,
        action="pos_shift.closed",
        resource_type="pos_shift",
        resource_id=str(shift.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PosShiftRead.model_validate(shift)
