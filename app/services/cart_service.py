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
from app.schemas.pos_cart import CartDiscountRead, CartLineRead, CartRead
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
        tax_total=Decimal("0.00"),
        total=Decimal("0.00"),
    )
    db.add(cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def _recalc_totals(db: AsyncSession, cart: PosCart) -> None:
    lines_res = await db.execute(select(PosCartLine).where(PosCartLine.cart_id == cart.id))
    lines = list(lines_res.scalars().all())
    disc_res = await db.execute(select(PosCartDiscount).where(PosCartDiscount.cart_id == cart.id))
    discounts = list(disc_res.scalars().all())
    discount_total = q2(sum((d.amount for d in discounts), Decimal("0.00")))

    if not lines:
        cart.subtotal = Decimal("0.00")
        cart.discount_total = discount_total
        cart.tax_total = Decimal("0.00")
        cart.total = q2(max(Decimal("0.00"), Decimal("0.00") - discount_total))
        return

    product_ids = {ln.product_id for ln in lines}
    pres = await db.execute(select(Product).where(Product.id.in_(product_ids)))
    prods = {p.id: p for p in pres.scalars().all()}

    line_bases: list[tuple[PosCartLine, Decimal]] = []
    for ln in lines:
        p = prods.get(ln.product_id)
        rate = p.output_vat_rate if p and p.output_vat_rate is not None else Decimal("0")
        if rate < 0:
            rate = Decimal("0")
        if rate > Decimal("1"):
            rate = Decimal("1")
        ln.tax_rate = rate
        base = q2(ln.unit_price * Decimal(ln.qty))
        ln.line_total = base
        line_bases.append((ln, base))

    subtotal_net = q2(sum(b for _, b in line_bases))
    if subtotal_net <= 0:
        for ln, _ in line_bases:
            ln.line_tax_amount = Decimal("0.00")
        cart.subtotal = subtotal_net
        cart.discount_total = discount_total
        cart.tax_total = Decimal("0.00")
        cart.total = q2(max(Decimal("0.00"), subtotal_net - discount_total))
        return

    disc_eff = min(discount_total, subtotal_net)
    tax_sum = Decimal("0.00")
    for ln, base in line_bases:
        share = q2(disc_eff * (base / subtotal_net))
        net_after = q2(base - share)
        if net_after < 0:
            net_after = Decimal("0.00")
        tax = q2(net_after * ln.tax_rate) if net_after > 0 else Decimal("0.00")
        ln.line_tax_amount = tax
        tax_sum += tax

    cart.subtotal = subtotal_net
    cart.discount_total = discount_total
    cart.tax_total = q2(tax_sum)
    cart.total = q2(max(Decimal("0.00"), subtotal_net - discount_total + cart.tax_total))


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
    rate = product.output_vat_rate if product.output_vat_rate is not None else Decimal("0")
    if rate < 0:
        rate = Decimal("0")
    if rate > Decimal("1"):
        rate = Decimal("1")
    if line:
        line.qty = qty
        line.unit_price = unit_price
        line.tax_rate = rate
        line.line_total = q2(unit_price * qty)
        line.line_tax_amount = Decimal("0.00")
    else:
        db.add(
            PosCartLine(
                cart_id=cart.id,
                product_id=product_id,
                qty=qty,
                unit_price=unit_price,
                line_total=q2(unit_price * qty),
                tax_rate=rate,
                line_tax_amount=Decimal("0.00"),
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


async def read_cart_as_schema(db: AsyncSession, *, cart_id: int) -> CartRead:
    """Load cart with lines/discounts and product labels for POS UI."""
    c_res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = c_res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")

    lines_res = await db.execute(select(PosCartLine).where(PosCartLine.cart_id == cart_id))
    lines = list(lines_res.scalars().all())
    disc_res = await db.execute(select(PosCartDiscount).where(PosCartDiscount.cart_id == cart_id))
    discounts = list(disc_res.scalars().all())

    product_ids = {ln.product_id for ln in lines}
    prods: dict[int, Product] = {}
    if product_ids:
        pres = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        prods = {p.id: p for p in pres.scalars().all()}

    line_reads: list[CartLineRead] = []
    for ln in lines:
        p = prods.get(ln.product_id)
        line_reads.append(
            CartLineRead(
                id=ln.id,
                product_id=ln.product_id,
                product_name=p.name if p else "",
                product_sku=p.sku if p else "",
                barcode=p.barcode if p else None,
                qty=ln.qty,
                unit_price=ln.unit_price,
                line_total=ln.line_total,
                tax_rate=ln.tax_rate,
                line_tax_amount=ln.line_tax_amount,
            )
        )

    disc_reads = [
        CartDiscountRead(id=d.id, code=d.code, amount=d.amount, created_at=d.created_at)
        for d in discounts
    ]

    return CartRead(
        id=cart.id,
        terminal_id=cart.terminal_id,
        branch_id=cart.branch_id,
        shift_id=cart.shift_id,
        customer_id=cart.customer_id,
        status=cart.status,
        subtotal=cart.subtotal,
        discount_total=cart.discount_total,
        tax_total=cart.tax_total,
        total=cart.total,
        lines=line_reads,
        discounts=disc_reads,
    )
