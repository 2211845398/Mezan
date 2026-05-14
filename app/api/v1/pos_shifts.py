"""POS shift management APIs."""

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field
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
from app.services.pos_expense_service import record_pos_expense
from app.services.shift_service import (
    add_cash_event,
    close_shift,
    get_open_shift_for_terminal,
    open_shift,
)

router = APIRouter()


@router.get("/pos/shifts/current", response_model=PosShiftRead | None)
async def get_current_shift_endpoint(
    terminal_id: int = Query(..., description="POS terminal id"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_shifts", "read"),
) -> PosShiftRead | None:
    shift = await get_open_shift_for_terminal(db, terminal_id=terminal_id)
    if shift is None:
        return None
    return PosShiftRead.model_validate(shift)


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



class PosExpenseCreate(BaseModel):
    shift_id: int
    expense_category: str = Field(..., description='Category: cleaning, lunch, other')
    amount: Decimal = Field(..., gt=0)
    description: str | None = Field(None, max_length=255)


class PosExpenseRead(BaseModel):
    id: int
    shift_id: int
    branch_id: int
    expense_category: str
    amount: Decimal
    description: str | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.post('/pos/expenses', response_model=PosExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_pos_expense_endpoint(
    body: PosExpenseCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission('pos_shifts', 'update'),
) -> PosExpenseRead:
    expense = await record_pos_expense(
        db,
        shift_id=body.shift_id,
        expense_category=body.expense_category,
        amount=body.amount,
        description=body.description,
        user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action='pos_expense.created',
        resource_type='pos_expense',
        resource_id=str(expense.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return PosExpenseRead.model_validate(expense)
