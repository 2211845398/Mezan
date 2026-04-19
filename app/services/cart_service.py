"""POS cart state machine service."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, StateTransitionError, ValidationError
from app.models.pos_cart import PosCart, PosCartDiscount, PosCartEvent, PosCartLine
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.services.branch_scope import require_branch_open_for_operations
from app.services.pricing_service import get_active_sell_price
from app.utils.money import q2


def _assert_transition(current: str, action: str) -> str:
    transitions = {
        ("active", "park"): "parked",
        ("parked", "resume"): "active",
        ("active", "lock"): "checkout_locked",
        ("checkout_locked", "cancel"): "cancelled",
    }
    nxt = transitions.get((current, action))
    if not nxt:
        raise StateTransitionError(
            "Invalid cart transition",
            details={"status": current, "action": action},
        )
    return nxt


async def create_cart(
    db: AsyncSession, *, terminal_id: int, shift_id: int | None, customer_id: int | None
) -> PosCart:
    t_res = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = t_res.scalar_one_or_none()
    if not terminal:
        raise ValidationError("Terminal not found")
    await require_branch_open_for_operations(db, terminal.branch_id)
    cart = PosCart(
        terminal_id=terminal_id,
        branch_id=terminal.branch_id,
        shift_id=shift_id,
        customer_id=customer_id,
        status="active",
        subtotal=Decimal("0.00"),
        discount_total=Decimal("0.00"),
        total=Decimal("0.00"),
    )
    db.add(cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def _recalc_totals(db: AsyncSession, cart: PosCart) -> None:
    lines_res = await db.execute(select(PosCartLine).where(PosCartLine.cart_id == cart.id))
    lines = lines_res.scalars().all()
    disc_res = await db.execute(select(PosCartDiscount).where(PosCartDiscount.cart_id == cart.id))
    discounts = disc_res.scalars().all()
    subtotal = sum((x.line_total for x in lines), Decimal("0.00"))
    discount_total = sum((d.amount for d in discounts), Decimal("0.00"))
    cart.subtotal = q2(subtotal)
    cart.discount_total = q2(discount_total)
    cart.total = q2(max(Decimal("0.00"), subtotal - discount_total))


async def upsert_line(
    db: AsyncSession, *, cart_id: int, product_id: int, qty: int, created_by_user_id: int
) -> PosCart:
    c_res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = c_res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if cart.status != "active":
        raise StateTransitionError("Cart is not active")
    p_res = await db.execute(select(Product).where(Product.id == product_id))
    product = p_res.scalar_one_or_none()
    if not product:
        raise ValidationError("Product not found")
    unit_price = await get_active_sell_price(db, product_id=product.id)
    line_res = await db.execute(
        select(PosCartLine).where(
            PosCartLine.cart_id == cart.id, PosCartLine.product_id == product_id
        )
    )
    line = line_res.scalar_one_or_none()
    if line:
        line.qty = qty
        line.unit_price = unit_price
        line.line_total = q2(unit_price * qty)
    else:
        db.add(
            PosCartLine(
                cart_id=cart.id,
                product_id=product_id,
                qty=qty,
                unit_price=unit_price,
                line_total=q2(unit_price * qty),
            )
        )
    db.add(
        PosCartEvent(
            cart_id=cart.id,
            event_type="line_upserted",
            payload={"product_id": product_id, "qty": qty},
            created_by_user_id=created_by_user_id,
        )
    )
    await _recalc_totals(db, cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def apply_discount(
    db: AsyncSession, *, cart_id: int, code: str, amount: Decimal, created_by_user_id: int
) -> PosCart:
    res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if cart.status != "active":
        raise StateTransitionError("Cart is not active")
    discount_amount = q2(amount)
    db.add(PosCartDiscount(cart_id=cart.id, code=code, amount=discount_amount))
    db.add(
        PosCartEvent(
            cart_id=cart.id,
            event_type="discount_applied",
            payload={"code": code, "amount": str(discount_amount)},
            created_by_user_id=created_by_user_id,
        )
    )
    await _recalc_totals(db, cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def change_state(db: AsyncSession, *, cart_id: int, action: str, user_id: int) -> PosCart:
    res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    new_status = _assert_transition(cart.status, action)
    cart.status = new_status
    if new_status == "checkout_locked":
        cart.locked_at = datetime.now(UTC)
    db.add(
        PosCartEvent(
            cart_id=cart.id,
            event_type="state_changed",
            payload={"action": action, "new_status": new_status},
            created_by_user_id=user_id,
        )
    )
    await db.commit()
    await db.refresh(cart)
    return cart
