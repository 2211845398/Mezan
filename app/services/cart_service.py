"""POS cart state machine service."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import ROUND_FLOOR, Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    NotFoundError,
    StateTransitionError,
    ValidationError,
    validation_error,
)
from app.models.discount import DiscountRule, DiscountType, DiscountUsageLog
from app.models.pos_cart import CartDaySequence, PosCart, PosCartDiscount, PosCartEvent, PosCartLine
from app.models.pos_shift import PosShift
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.unit_of_measure import UnitOfMeasure
from app.schemas.pos_cart import CartDiscountRead, CartLineRead, CartRead
from app.services.accounting_service import get_accounting_settings
from app.services.branch_scope import require_branch_open_for_operations
from app.services.catalog_service import map_effective_output_tax_rates, resolve_default_variant_id
from app.services.discount_service import get_discount_rule_by_code, validate_discount
from app.services.loyalty_service import get_customer_balance
from app.services.pos_customer_guard import assert_customer_active_for_pos
from app.services.pricing_service import get_active_sell_price
from app.utils.money import q2

# Reserved POS cart discount code for loyalty redemption (not a CRM promotion code).
LOYALTY_CART_DISCOUNT_CODE = "__POS_LOYALTY__"


def _discount_amount_from_rule(*, rule: DiscountRule, eligible_subtotal: Decimal) -> Decimal:
    """Compute cart-level discount amount from an active rule and eligible line subtotal."""
    if eligible_subtotal <= 0:
        raise ValidationError(
            "Cart has no eligible subtotal for this discount",
            details={"eligible_subtotal": str(eligible_subtotal)},
        )
    if rule.min_order_amount is not None and eligible_subtotal < q2(rule.min_order_amount):
        raise ValidationError(
            "Order subtotal is below the minimum for this discount",
            details={
                "min_order_amount": str(rule.min_order_amount),
                "eligible_subtotal": str(eligible_subtotal),
            },
        )
    dt = rule.discount_type
    if dt == DiscountType.PERCENTAGE:
        raw = q2(eligible_subtotal * (rule.value / Decimal("100")))
    elif dt == DiscountType.FLAT:
        raw = q2(min(rule.value, eligible_subtotal))
    else:
        raise ValidationError(
            "This promotion type cannot be applied with a checkout discount code",
            details={"discount_type": dt.value},
        )
    if rule.max_discount_amount is not None:
        raw = min(raw, q2(rule.max_discount_amount))
    raw = q2(raw)
    if raw <= 0:
        raise ValidationError("Calculated discount amount is zero")
    return raw


def _assert_transition(current: str, action: str) -> str:
    transitions = {
        ("active", "park"): "parked",
        ("parked", "resume"): "active",
        ("active", "lock"): "checkout_locked",
        # Abandon tender / close payment UI: return to editing, do not void the cart.
        ("checkout_locked", "cancel"): "active",
        ("active", "cancel"): "cancelled",
        ("parked", "cancel"): "cancelled",
    }
    nxt = transitions.get((current, action))
    if not nxt:
        raise StateTransitionError(
            "Invalid cart transition",
            details={"status": current, "action": action},
        )
    return nxt


async def _next_daily_cart_number(
    db: AsyncSession, branch_id: int, cart_date: date | None = None
) -> int:
    """Get the next cart number for a branch on a given date (Epic 21.1)."""
    if cart_date is None:
        cart_date = datetime.now(UTC).date()

    # Try to get existing sequence
    seq_res = await db.execute(
        select(CartDaySequence).where(
            CartDaySequence.branch_id == branch_id,
            CartDaySequence.cart_date == cart_date,
        )
    )
    seq = seq_res.scalar_one_or_none()

    if seq is None:
        # Create new sequence starting at 1
        seq = CartDaySequence(
            branch_id=branch_id,
            cart_date=cart_date,
            next_number=2,  # Return 1, next will be 2
        )
        db.add(seq)
        await db.flush()
        return 1
    else:
        # Get current number and increment
        current = seq.next_number
        seq.next_number = current + 1
        await db.flush()
        return current


async def create_cart(
    db: AsyncSession, *, terminal_id: int, shift_id: int | None, customer_id: int | None
) -> PosCart:
    t_res = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = t_res.scalar_one_or_none()
    if not terminal:
        raise ValidationError("Terminal not found")
    await require_branch_open_for_operations(db, terminal.branch_id)

    # Epic 21.2: Validate shift belongs to terminal and is open
    if shift_id is not None:
        s_res = await db.execute(
            select(PosShift).where(
                PosShift.id == shift_id,
                PosShift.terminal_id == terminal_id,
                PosShift.status == "open",
            )
        )
        shift = s_res.scalar_one_or_none()
        if not shift:
            raise ValidationError("Shift not found, does not belong to terminal, or is not open")

    if customer_id is not None:
        await assert_customer_active_for_pos(db, customer_id)

    # Epic 21.1: Generate per-branch-per-day cart number
    daily_cart_number = await _next_daily_cart_number(db, terminal.branch_id)

    cart = PosCart(
        terminal_id=terminal_id,
        branch_id=terminal.branch_id,
        shift_id=shift_id,
        customer_id=customer_id,
        daily_cart_number=daily_cart_number,
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
    # Session uses autoflush=False; flush so newly added/modified lines are visible to this SELECT.
    await db.flush()
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
    rates = await map_effective_output_tax_rates(db, products_by_id=prods)

    line_bases: list[tuple[PosCartLine, Decimal]] = []
    for ln in lines:
        p = prods.get(ln.product_id)
        rate = rates.get(ln.product_id, Decimal("0")) if p else Decimal("0")
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
    db: AsyncSession,
    *,
    cart_id: int,
    product_id: int,
    qty: int,
    created_by_user_id: int,
    variant_id: int | None = None,
) -> PosCart:
    """Add, update, or delete cart line. qty=0 deletes the line (Epic 21.8).

    ``variant_id`` defaults to the product's primary active variant when omitted.
    Lines are keyed by (cart, product, variant).
    """
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

    resolved_variant_id = (
        variant_id
        if variant_id is not None
        else await resolve_default_variant_id(db, product_id=product_id)
    )

    line_res = await db.execute(
        select(PosCartLine).where(
            and_(
                PosCartLine.cart_id == cart.id,
                PosCartLine.product_id == product_id,
                PosCartLine.variant_id == resolved_variant_id,
            )
        )
    )
    line = line_res.scalar_one_or_none()

    # Epic 21.8: qty=0 means delete the line
    if qty <= 0:
        if line:
            await db.delete(line)
            db.add(
                PosCartEvent(
                    cart_id=cart.id,
                    event_type="line_deleted",
                    payload={
                        "product_id": product_id,
                        "variant_id": resolved_variant_id,
                    },
                    created_by_user_id=created_by_user_id,
                )
            )
        await _recalc_totals(db, cart)
        await db.commit()
        await db.refresh(cart)
        return cart

    unit_price = await get_active_sell_price(db, product_id=product.id)
    rates = await map_effective_output_tax_rates(db, products_by_id={product.id: product})
    rate = rates.get(product.id, Decimal("0"))
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
                variant_id=resolved_variant_id,
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
            payload={
                "product_id": product_id,
                "variant_id": resolved_variant_id,
                "qty": qty,
            },
            created_by_user_id=created_by_user_id,
        )
    )
    await _recalc_totals(db, cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def apply_discount(
    db: AsyncSession, *, cart_id: int, code: str, created_by_user_id: int
) -> PosCart:
    res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if cart.status != "active":
        raise StateTransitionError("Cart is not active")

    trimmed = code.strip()
    if trimmed == LOYALTY_CART_DISCOUNT_CODE:
        validation_error(
            "pos_discount_reserved",
            "This discount code is reserved for loyalty redemption",
            code=trimmed,
        )
    dup = await db.execute(
        select(PosCartDiscount.id)
        .where(PosCartDiscount.cart_id == cart.id, PosCartDiscount.code == trimmed)
        .limit(1)
    )
    if dup.scalar_one_or_none() is not None:
        validation_error(
            "pos_discount_already_applied",
            "This discount code is already applied to the cart",
            code=trimmed,
        )

    rule = await get_discount_rule_by_code(db, code=trimmed)
    rule = await validate_discount(db, rule_id=rule.id)

    lines_res = await db.execute(select(PosCartLine).where(PosCartLine.cart_id == cart.id))
    lines = list(lines_res.scalars().all())
    positive_lines = [ln for ln in lines if int(ln.qty or 0) > 0]

    targets = rule.target_product_ids or []
    if targets:
        tset = {int(x) for x in targets}
        eligible = q2(
            sum(
                q2(ln.unit_price * Decimal(int(ln.qty)))
                for ln in positive_lines
                if ln.product_id in tset
            )
        )
        if eligible <= 0:
            raise ValidationError(
                "This discount applies only to specific products that are not in the cart",
                details={"target_product_ids": list(targets)},
            )
    else:
        eligible = q2(sum(q2(ln.unit_price * Decimal(int(ln.qty))) for ln in positive_lines))

    discount_amount = _discount_amount_from_rule(rule=rule, eligible_subtotal=eligible)

    db.add(PosCartDiscount(cart_id=cart.id, code=trimmed, amount=discount_amount))
    db.add(
        PosCartEvent(
            cart_id=cart.id,
            event_type="discount_applied",
            payload={
                "code": trimmed,
                "amount": str(discount_amount),
                "discount_rule_id": rule.id,
            },
            created_by_user_id=created_by_user_id,
        )
    )
    rule.usage_count = int(rule.usage_count) + 1
    db.add(
        DiscountUsageLog(
            discount_rule_id=rule.id,
            cart_id=cart.id,
            customer_id=cart.customer_id,
            discount_amount=discount_amount,
            applied_by_user_id=created_by_user_id,
        )
    )
    await db.flush()
    await _recalc_totals(db, cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def apply_loyalty_discount(
    db: AsyncSession, *, cart_id: int, loyalty_points: int, created_by_user_id: int
) -> PosCart:
    """Apply a cart discount funded by loyalty points (ledger debit happens at invoice finalize)."""
    res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if cart.status != "active":
        raise StateTransitionError("Cart is not active")
    if cart.customer_id is None:
        raise ValidationError(
            "Loyalty discount requires a customer on the cart",
            details={"cart_id": cart_id},
        )
    await assert_customer_active_for_pos(db, cart.customer_id)

    balance = await get_customer_balance(db, cart.customer_id)
    if loyalty_points > balance:
        raise ValidationError(
            "Insufficient loyalty points for this redemption",
            details={"balance": balance, "requested": loyalty_points},
        )

    settings = await get_accounting_settings(db)
    per_point = q2(Decimal(str(settings.default_loyalty_point_value)))
    if per_point <= 0:
        raise ValidationError(
            "Loyalty point value is not configured",
            details={"default_loyalty_point_value": str(settings.default_loyalty_point_value)},
        )

    lines_res = await db.execute(select(PosCartLine).where(PosCartLine.cart_id == cart.id))
    lines = list(lines_res.scalars().all())
    positive_lines = [ln for ln in lines if int(ln.qty or 0) > 0]
    subtotal_net = q2(sum(q2(ln.unit_price * Decimal(int(ln.qty))) for ln in positive_lines))
    if subtotal_net <= 0:
        raise ValidationError(
            "Cart has no positive line subtotal for loyalty discount",
            details={"cart_id": cart_id},
        )

    disc_res = await db.execute(select(PosCartDiscount).where(PosCartDiscount.cart_id == cart.id))
    discounts = list(disc_res.scalars().all())
    other_discount_total = q2(
        sum(
            (
                d.amount
                for d in discounts
                if d.code != LOYALTY_CART_DISCOUNT_CODE and d.loyalty_points_redeemed is None
            ),
            Decimal("0.00"),
        )
    )
    eligible = q2(subtotal_net - other_discount_total)
    if eligible <= 0:
        raise ValidationError(
            "No remaining subtotal available for loyalty discount after other discounts",
            details={"eligible_subtotal": str(eligible)},
        )

    max_points_by_cart = int((eligible / per_point).to_integral_value(rounding=ROUND_FLOOR))
    if max_points_by_cart < 1:
        raise ValidationError(
            "Cart subtotal is too small for the configured loyalty point value",
            details={"eligible_subtotal": str(eligible), "per_point": str(per_point)},
        )

    actual_points = min(loyalty_points, balance, max_points_by_cart)
    if actual_points < loyalty_points:
        raise ValidationError(
            "Requested loyalty points exceed what can be applied to this cart",
            details={
                "requested": loyalty_points,
                "allowed": actual_points,
                "balance": balance,
                "max_by_cart": max_points_by_cart,
            },
        )

    discount_amount = q2(Decimal(actual_points) * per_point)
    if discount_amount <= 0:
        raise ValidationError("Calculated loyalty discount amount is zero")

    for d in discounts:
        if d.code == LOYALTY_CART_DISCOUNT_CODE or d.loyalty_points_redeemed is not None:
            await db.delete(d)

    db.add(
        PosCartDiscount(
            cart_id=cart.id,
            code=LOYALTY_CART_DISCOUNT_CODE,
            amount=discount_amount,
            loyalty_points_redeemed=actual_points,
        )
    )
    db.add(
        PosCartEvent(
            cart_id=cart.id,
            event_type="discount_applied",
            payload={
                "mode": "loyalty",
                "loyalty_points": actual_points,
                "amount": str(discount_amount),
                "per_point": str(per_point),
            },
            created_by_user_id=created_by_user_id,
        )
    )
    await db.flush()
    await _recalc_totals(db, cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def change_state(db: AsyncSession, *, cart_id: int, action: str, user_id: int) -> PosCart:
    res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if action in ("lock", "park"):
        lines_chk = await db.execute(
            select(PosCartLine.id)
            .where(PosCartLine.cart_id == cart.id, PosCartLine.qty > 0)
            .limit(1)
        )
        if lines_chk.scalar_one_or_none() is None:
            msg = (
                "Cannot lock checkout for an empty cart"
                if action == "lock"
                else "Cannot park an empty cart"
            )
            validation_error(
                "checkout_empty_cart" if action == "lock" else "park_empty_cart",
                msg,
                cart_id=cart.id,
                action=action,
            )
    prev_status = cart.status
    new_status = _assert_transition(cart.status, action)
    cart.status = new_status
    if new_status == "checkout_locked":
        cart.locked_at = datetime.now(UTC)
    elif prev_status == "checkout_locked" and new_status == "active":
        cart.locked_at = None
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


def _cart_to_read(
    cart: PosCart,
    *,
    lines: list[PosCartLine],
    discounts: list[PosCartDiscount],
    prods: dict[int, Product],
    variants: dict[int, ProductVariant],
    uom_by_id: dict[int, UnitOfMeasure],
) -> CartRead:
    line_reads: list[CartLineRead] = []
    for ln in lines:
        p = prods.get(ln.product_id)
        pv = variants.get(ln.variant_id) if ln.variant_id is not None else None
        uom = uom_by_id.get(p.uom_id) if p else None
        line_reads.append(
            CartLineRead(
                id=ln.id,
                product_id=ln.product_id,
                variant_id=ln.variant_id,
                product_name=p.name if p else "",
                product_sku=(pv.sku if pv else None) or (p.sku if p else ""),
                barcode=pv.barcode if pv else None,
                product_image_url=p.image_url if p else None,
                uom_symbol=uom.symbol if uom else "pcs",
                qty=ln.qty,
                unit_price=ln.unit_price,
                line_total=ln.line_total,
                tax_rate=ln.tax_rate,
                line_tax_amount=ln.line_tax_amount,
            )
        )
    disc_reads = [
        CartDiscountRead(
            id=d.id,
            code=d.code,
            amount=d.amount,
            loyalty_points_redeemed=d.loyalty_points_redeemed,
            created_at=d.created_at,
        )
        for d in discounts
    ]
    return CartRead(
        id=cart.id,
        terminal_id=cart.terminal_id,
        branch_id=cart.branch_id,
        daily_cart_number=cart.daily_cart_number,
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


async def _load_cart_catalog_maps(
    db: AsyncSession,
    *,
    product_ids: set[int],
    variant_ids: set[int],
) -> tuple[dict[int, Product], dict[int, ProductVariant], dict[int, UnitOfMeasure]]:
    prods: dict[int, Product] = {}
    uom_by_id: dict[int, UnitOfMeasure] = {}
    if product_ids:
        pres = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        prods = {p.id: p for p in pres.scalars().all()}
        uom_ids = {p.uom_id for p in prods.values()}
        if uom_ids:
            ures = await db.execute(select(UnitOfMeasure).where(UnitOfMeasure.id.in_(uom_ids)))
            uom_by_id = {int(u.id): u for u in ures.scalars().all()}
    variants: dict[int, ProductVariant] = {}
    if variant_ids:
        vres = await db.execute(select(ProductVariant).where(ProductVariant.id.in_(variant_ids)))
        variants = {v.id: v for v in vres.scalars().all()}
    return prods, variants, uom_by_id


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
    variant_ids = {ln.variant_id for ln in lines if ln.variant_id is not None}
    prods, variants, uom_by_id = await _load_cart_catalog_maps(
        db, product_ids=product_ids, variant_ids=variant_ids
    )
    return _cart_to_read(
        cart,
        lines=lines,
        discounts=discounts,
        prods=prods,
        variants=variants,
        uom_by_id=uom_by_id,
    )


async def list_carts_read(
    db: AsyncSession,
    *,
    status: str | None = None,
    terminal_id: int | None = None,
    branch_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[CartRead], int]:
    """Paginated cart list with batched line/product loads (avoids N+1)."""
    from app.schemas.pagination import clamp_pagination

    limit, offset = clamp_pagination(limit, offset)
    filters = []
    if status is not None:
        filters.append(PosCart.status == status)
    if terminal_id is not None:
        filters.append(PosCart.terminal_id == terminal_id)
    if branch_id is not None:
        filters.append(PosCart.branch_id == branch_id)

    count_stmt = select(func.count()).select_from(PosCart)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int(await db.scalar(count_stmt) or 0)

    q = select(PosCart).order_by(PosCart.updated_at.desc()).limit(limit).offset(offset)
    if filters:
        q = q.where(*filters)
    carts = list((await db.execute(q)).scalars().all())
    if not carts:
        return [], total

    cart_ids = [c.id for c in carts]
    lines_res = await db.execute(select(PosCartLine).where(PosCartLine.cart_id.in_(cart_ids)))
    all_lines = list(lines_res.scalars().all())
    disc_res = await db.execute(
        select(PosCartDiscount).where(PosCartDiscount.cart_id.in_(cart_ids))
    )
    all_discounts = list(disc_res.scalars().all())

    lines_by_cart: dict[int, list[PosCartLine]] = {cid: [] for cid in cart_ids}
    for ln in all_lines:
        lines_by_cart.setdefault(ln.cart_id, []).append(ln)
    discs_by_cart: dict[int, list[PosCartDiscount]] = {cid: [] for cid in cart_ids}
    for d in all_discounts:
        discs_by_cart.setdefault(d.cart_id, []).append(d)

    product_ids = {ln.product_id for ln in all_lines}
    variant_ids = {ln.variant_id for ln in all_lines if ln.variant_id is not None}
    prods, variants, uom_by_id = await _load_cart_catalog_maps(
        db, product_ids=product_ids, variant_ids=variant_ids
    )

    items = [
        _cart_to_read(
            cart,
            lines=lines_by_cart.get(cart.id, []),
            discounts=discs_by_cart.get(cart.id, []),
            prods=prods,
            variants=variants,
            uom_by_id=uom_by_id,
        )
        for cart in carts
    ]
    return items, total


async def patch_cart_customer(
    db: AsyncSession, *, cart_id: int, customer_id: int | None
) -> PosCart:
    """Set cart customer; clears or replaces customer_id after eligibility checks."""
    c_res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = c_res.scalar_one_or_none()
    if not cart:
        raise NotFoundError("Cart not found")
    if cart.status not in ("active", "parked", "checkout_locked"):
        raise StateTransitionError(
            "Cannot modify cart customer in current status",
            details={"status": cart.status},
        )
    if customer_id is not None:
        await assert_customer_active_for_pos(db, customer_id)
    cart.customer_id = customer_id
    await db.commit()
    await db.refresh(cart)
    return cart


async def deduct_exchange_cart_for_return(
    db: AsyncSession,
    *,
    cart_id: int,
    deductions: list[tuple[int, int, int]],
    created_by_user_id: int,
) -> None:
    """Subtract returned quantities from a linked exchange cart (same DB session, no commit)."""
    if not deductions:
        return
    c_res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = c_res.scalar_one_or_none()
    if not cart:
        raise ValidationError("Exchange cart not found")
    if cart.status != "active":
        raise ValidationError("Exchange cart must be active to apply return deductions")

    for product_id, variant_id, deduct_qty in deductions:
        if deduct_qty <= 0:
            continue
        line_res = await db.execute(
            select(PosCartLine).where(
                PosCartLine.cart_id == cart_id,
                PosCartLine.product_id == product_id,
                PosCartLine.variant_id == variant_id,
            )
        )
        line = line_res.scalar_one_or_none()
        if not line:
            raise ValidationError(
                "Exchange cart is missing a line required for this return",
                details={"product_id": product_id, "variant_id": variant_id},
            )
        if line.qty < deduct_qty:
            raise ValidationError(
                "Exchange cart does not contain enough quantity for this return",
                details={
                    "product_id": product_id,
                    "variant_id": variant_id,
                    "cart_qty": line.qty,
                    "deduct": deduct_qty,
                },
            )
        new_qty = line.qty - deduct_qty
        if new_qty <= 0:
            await db.delete(line)
            db.add(
                PosCartEvent(
                    cart_id=cart.id,
                    event_type="line_deleted",
                    payload={
                        "product_id": product_id,
                        "variant_id": variant_id,
                        "reason": "return_exchange",
                    },
                    created_by_user_id=created_by_user_id,
                )
            )
        else:
            line.qty = new_qty
            unit_price = await get_active_sell_price(db, product_id=product_id)
            p_res = await db.execute(select(Product).where(Product.id == product_id))
            product = p_res.scalar_one_or_none()
            rates = await map_effective_output_tax_rates(
                db, products_by_id={product_id: product} if product else {}
            )
            rate = rates.get(product_id, Decimal("0")) if product else Decimal("0")
            if rate < 0:
                rate = Decimal("0")
            if rate > Decimal("1"):
                rate = Decimal("1")
            line.unit_price = unit_price
            line.tax_rate = rate
            line.line_total = q2(unit_price * new_qty)
            line.line_tax_amount = Decimal("0.00")
            db.add(
                PosCartEvent(
                    cart_id=cart.id,
                    event_type="line_upserted",
                    payload={
                        "product_id": product_id,
                        "variant_id": variant_id,
                        "qty": new_qty,
                        "reason": "return_exchange",
                    },
                    created_by_user_id=created_by_user_id,
                )
            )
    await _recalc_totals(db, cart)
