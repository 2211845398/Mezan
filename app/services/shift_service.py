"""Shift management service."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, StateTransitionError, ValidationError
from app.models.pos_shift import PosCashEvent, PosShift, ZReport
from app.models.pos_terminal import POSTerminal


async def open_shift(
    db: AsyncSession, *, terminal_id: int, opening_float: float, opened_by_user_id: int
) -> PosShift:
    if opening_float < 0:
        raise ValidationError("opening_float must be >= 0")
    t_res = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = t_res.scalar_one_or_none()
    if not terminal or not terminal.is_authorized:
        raise ValidationError("Terminal is not authorized")

    existing = await db.execute(
        select(PosShift).where(PosShift.terminal_id == terminal_id, PosShift.status == "open")
    )
    if existing.scalar_one_or_none():
        raise StateTransitionError("An open shift already exists for this terminal")

    shift = PosShift(
        terminal_id=terminal_id,
        branch_id=terminal.branch_id,
        opened_by_user_id=opened_by_user_id,
        status="open",
        opening_float=opening_float,
        expected_cash=opening_float,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return shift


async def add_cash_event(
    db: AsyncSession,
    *,
    shift_id: int,
    event_type: str,
    amount: float,
    note: str | None,
    created_by_user_id: int,
) -> PosShift:
    res = await db.execute(select(PosShift).where(PosShift.id == shift_id))
    shift = res.scalar_one_or_none()
    if not shift:
        raise NotFoundError("Shift not found", details={"shift_id": shift_id})
    if shift.status != "open":
        raise StateTransitionError("Shift is not open")
    ev = PosCashEvent(
        shift_id=shift.id,
        event_type=event_type,
        amount=amount,
        note=note,
        created_by_user_id=created_by_user_id,
    )
    db.add(ev)
    if event_type in {"sale", "adjust_in"}:
        shift.expected_cash = float(shift.expected_cash) + amount
    elif event_type in {"refund", "payout", "adjust_out"}:
        shift.expected_cash = float(shift.expected_cash) - abs(amount)
    await db.commit()
    await db.refresh(shift)
    return shift


async def close_shift(db: AsyncSession, *, shift_id: int, declared_cash: float, closed_by_user_id: int) -> PosShift:
    res = await db.execute(select(PosShift).where(PosShift.id == shift_id))
    shift = res.scalar_one_or_none()
    if not shift:
        raise NotFoundError("Shift not found", details={"shift_id": shift_id})
    if shift.status != "open":
        raise StateTransitionError("Shift is not open")
    shift.declared_cash = declared_cash
    shift.variance = float(declared_cash) - float(shift.expected_cash)
    shift.closed_by_user_id = closed_by_user_id
    shift.status = "closed"
    shift.closed_at = datetime.now(UTC)
    payload = {
        "shift_id": shift.id,
        "terminal_id": shift.terminal_id,
        "opening_float": float(shift.opening_float),
        "expected_cash": float(shift.expected_cash),
        "declared_cash": float(shift.declared_cash),
        "variance": float(shift.variance),
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
    }
    db.add(ZReport(shift_id=shift.id, report_payload=payload))
    await db.commit()
    await db.refresh(shift)
    return shift
