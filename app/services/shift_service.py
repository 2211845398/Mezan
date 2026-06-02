"""Shift management service."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, StateTransitionError, ValidationError
from app.models.pos_cart import PosCart
from app.models.pos_shift import PosCashEvent, PosShift, ZReport
from app.models.pos_terminal import POSTerminal
from app.models.sales_invoice import SalesInvoice
from app.services.branch_scope import require_branch_open_for_operations
from app.services.document_posting_service import post_pos_shift_variance_gl
from app.utils.money import q2


async def open_shift(
    db: AsyncSession, *, terminal_id: int, opening_float: Decimal, opened_by_user_id: int
) -> PosShift:
    if opening_float < 0:
        raise ValidationError("opening_float must be >= 0")
    t_res = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = t_res.scalar_one_or_none()
    if not terminal or not terminal.is_authorized:
        raise ValidationError("Terminal is not authorized")
    await require_branch_open_for_operations(db, terminal.branch_id)

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
        opening_float=q2(opening_float),
        expected_cash=q2(opening_float),
    )
    db.add(shift)
    await db.flush()
    await db.refresh(shift)
    return shift


async def get_open_shift_for_terminal(db: AsyncSession, *, terminal_id: int) -> PosShift | None:
    """Return the single open shift for this terminal, if any."""
    existing = await db.execute(
        select(PosShift).where(PosShift.terminal_id == terminal_id, PosShift.status == "open")
    )
    return existing.scalar_one_or_none()


async def list_cash_events_for_shift(
    db: AsyncSession, *, shift_id: int, limit: int = 20
) -> list[PosCashEvent]:
    """Recent cash drawer events for an open or closed shift (newest first)."""
    cap = max(1, min(limit, 100))
    result = await db.execute(
        select(PosCashEvent)
        .where(PosCashEvent.shift_id == shift_id)
        .order_by(PosCashEvent.created_at.desc())
        .limit(cap)
    )
    return list(result.scalars().all())


async def count_completed_sales_transactions_for_shift(db: AsyncSession, *, shift_id: int) -> int:
    """Non-voided sales invoices whose originating cart belongs to this shift."""
    stmt = (
        select(func.count())
        .select_from(SalesInvoice)
        .join(PosCart, PosCart.id == SalesInvoice.cart_id)
        .where(PosCart.shift_id == shift_id, SalesInvoice.voided_at.is_(None))
    )
    res = await db.execute(stmt)
    return int(res.scalar_one() or 0)


async def add_cash_event(
    db: AsyncSession,
    *,
    shift_id: int,
    event_type: str,
    amount: Decimal,
    note: str | None,
    created_by_user_id: int,
) -> PosShift:
    # Normalize common aliases coming from different client UIs.
    normalized_event_type_map: dict[str, str] = {
        # Common “drawer cash in/out” naming
        "cash_in": "adjust_in",
        "cash_out": "adjust_out",
    }
    normalized_event_type = normalized_event_type_map.get(event_type, event_type)

    allowed_event_types = {"sale", "adjust_in", "refund", "payout", "adjust_out"}
    if normalized_event_type not in allowed_event_types:
        raise ValidationError(
            "Invalid event_type for cash event",
            details={
                "event_type": event_type,
                "normalized_event_type": normalized_event_type,
                "allowed": sorted(allowed_event_types),
            },
        )

    res = await db.execute(select(PosShift).where(PosShift.id == shift_id).with_for_update())
    shift = res.scalar_one_or_none()
    if not shift:
        raise NotFoundError("Shift not found", details={"shift_id": shift_id})
    if shift.status != "open":
        raise StateTransitionError("Shift is not open")

    amt = q2(amount).copy_abs()
    if normalized_event_type in {"sale", "adjust_in"}:
        delta = amt
    else:
        # refund, payout, adjust_out all reduce expected cash
        delta = -amt

    ev = PosCashEvent(
        shift_id=shift.id,
        event_type=normalized_event_type,
        # Store cash movement as a positive magnitude; the direction is derived from event_type.
        amount=amt,
        note=note,
        created_by_user_id=created_by_user_id,
    )
    db.add(ev)

    # Atomically update expected cash under the row lock.
    await db.execute(
        update(PosShift)
        .where(PosShift.id == shift.id)
        .values(expected_cash=PosShift.expected_cash + delta)
    )
    await db.flush()
    await db.refresh(shift)
    return shift


async def close_shift(
    db: AsyncSession, *, shift_id: int, declared_cash: Decimal, closed_by_user_id: int
) -> PosShift:
    res = await db.execute(select(PosShift).where(PosShift.id == shift_id))
    shift = res.scalar_one_or_none()
    if not shift:
        raise NotFoundError("Shift not found", details={"shift_id": shift_id})
    if shift.status != "open":
        raise StateTransitionError("Shift is not open")
    shift.declared_cash = q2(declared_cash)
    shift.variance = q2(shift.declared_cash - shift.expected_cash)
    shift.closed_by_user_id = closed_by_user_id
    shift.status = "closed"
    shift.closed_at = datetime.now(UTC)
    payload = {
        "shift_id": shift.id,
        "terminal_id": shift.terminal_id,
        "opening_float": str(shift.opening_float),
        "expected_cash": str(shift.expected_cash),
        "declared_cash": str(shift.declared_cash),
        "variance": str(shift.variance),
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
    }
    db.add(ZReport(shift_id=shift.id, report_payload=payload))
    await db.flush()
    await post_pos_shift_variance_gl(db, shift=shift)
    await db.refresh(shift)
    return shift
