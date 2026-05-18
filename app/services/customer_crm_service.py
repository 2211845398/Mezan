"""CRM customer list/detail/update and purchase history (W-5.7)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.models.customer_profile import CustomerAccountStatus, CustomerProfile
from app.models.loyalty import LoyaltyLedger
from app.models.sales_invoice import SalesInvoice
from app.utils.money import q2
from app.utils.person_name import person_name_sql_expr

from app.services.customer_account_status import (
    parse_account_status,
    sync_is_active_from_account_status,
)


async def _loyalty_balance_scalar(db: AsyncSession, customer_id: int) -> int:
    res = await db.execute(
        select(LoyaltyLedger.balance_after)
        .where(LoyaltyLedger.customer_id == customer_id)
        .order_by(LoyaltyLedger.id.desc())
        .limit(1)
    )
    row = res.scalar_one_or_none()
    return int(row) if row is not None else 0


async def _lifetime_spend(db: AsyncSession, customer_id: int) -> Decimal:
    res = await db.execute(
        select(func.coalesce(func.sum(SalesInvoice.total), 0)).where(
            SalesInvoice.customer_id == customer_id,
            SalesInvoice.voided_at.is_(None),
        )
    )
    return q2(Decimal(res.scalar_one() or 0))


async def get_customer_or_404(db: AsyncSession, customer_id: int) -> CustomerProfile:
    res = await db.execute(select(CustomerProfile).where(CustomerProfile.id == customer_id))
    c = res.scalar_one_or_none()
    if not c:
        raise NotFoundError("Customer not found", details={"customer_id": customer_id})
    return c


async def list_customers(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    pos_ready: bool = False,
    activation: str = "all",
) -> tuple[list[tuple[CustomerProfile, int, Decimal]], int]:
    filters = []
    if pos_ready:
        filters.append(CustomerProfile.account_status == CustomerAccountStatus.ACTIVE)
    elif activation == "active":
        filters.append(CustomerProfile.account_status == CustomerAccountStatus.ACTIVE)
    elif activation == "pending":
        filters.append(CustomerProfile.account_status == CustomerAccountStatus.PENDING_ACTIVATION)
    elif activation == "suspended":
        filters.append(CustomerProfile.account_status == CustomerAccountStatus.SUSPENDED)
    if search and search.strip():
        q = f"%{search.strip()}%"
        disp = person_name_sql_expr(
            CustomerProfile.first_name,
            CustomerProfile.father_name,
            CustomerProfile.family_name,
        )
        filters.append(
            or_(
                CustomerProfile.phone.ilike(q),
                CustomerProfile.first_name.ilike(q),
                CustomerProfile.father_name.ilike(q),
                CustomerProfile.family_name.ilike(q),
                disp.ilike(q),
                CustomerProfile.email.ilike(q),
            )
        )
    count_stmt = select(func.count()).select_from(CustomerProfile)
    if filters:
        count_stmt = count_stmt.where(*filters)
    count_res = await db.execute(count_stmt)
    total = int(count_res.scalar_one() or 0)

    lb_sq = (
        select(LoyaltyLedger.balance_after)
        .where(LoyaltyLedger.customer_id == CustomerProfile.id)
        .order_by(LoyaltyLedger.id.desc())
        .limit(1)
        .correlate(CustomerProfile)
        .scalar_subquery()
    )
    lt_sq = (
        select(func.coalesce(func.sum(SalesInvoice.total), 0))
        .where(
            SalesInvoice.customer_id == CustomerProfile.id,
            SalesInvoice.voided_at.is_(None),
        )
        .correlate(CustomerProfile)
        .scalar_subquery()
    )

    stmt = select(CustomerProfile, lb_sq.label("loyalty_balance"), lt_sq.label("lifetime_spend"))
    if filters:
        stmt = stmt.where(*filters)
    stmt = stmt.order_by(CustomerProfile.id.desc()).limit(limit).offset(offset)
    res = await db.execute(stmt)
    rows: list[tuple[CustomerProfile, int, Decimal]] = []
    for row in res.all():
        c = row[0]
        bal = int(row[1] or 0)
        spend = q2(Decimal(row[2] or 0))
        rows.append((c, bal, spend))
    return rows, total


async def get_customer_detail_metrics(
    db: AsyncSession, customer_id: int
) -> tuple[CustomerProfile, int, Decimal]:
    c = await get_customer_or_404(db, customer_id)
    bal = await _loyalty_balance_scalar(db, customer_id)
    spend = await _lifetime_spend(db, customer_id)
    return c, bal, spend


async def update_customer_profile(
    db: AsyncSession, *, customer_id: int, data: dict
) -> CustomerProfile:
    allowed = {
        "first_name",
        "father_name",
        "family_name",
        "email",
        "is_temporary",
        "is_active",
        "account_status",
        "default_currency_id",
        "receivables_account_id",
    }
    c = await get_customer_or_404(db, customer_id)
    account_explicit = "account_status" in data
    legacy_active = "is_active" in data and data["is_active"] is not None

    for k, v in data.items():
        if k not in allowed:
            continue
        if k == "account_status":
            if v is None:
                continue
            c.account_status = parse_account_status(str(v))
            sync_is_active_from_account_status(c)
            continue
        if k == "is_active" and account_explicit:
            continue
        setattr(c, k, v)

    if legacy_active and not account_explicit:
        if data.get("is_active") is True:
            c.account_status = CustomerAccountStatus.ACTIVE
        else:
            if c.is_temporary:
                c.account_status = CustomerAccountStatus.PENDING_ACTIVATION
            else:
                c.account_status = CustomerAccountStatus.SUSPENDED
        sync_is_active_from_account_status(c)

    await db.flush()
    await db.refresh(c)
    return c


async def create_staff_customer(
    db: AsyncSession,
    *,
    phone: str,
    first_name: str | None,
    father_name: str | None,
    family_name: str | None,
    email: str | None,
    is_temporary: bool,
    default_currency_id: int | None,
    receivables_account_id: int | None,
    created_by_user_id: int,
) -> CustomerProfile:
    if not phone or not phone.strip():
        raise ValidationError("Phone is required")
    c = CustomerProfile(
        phone=phone.strip(),
        first_name=first_name,
        father_name=father_name,
        family_name=family_name,
        email=email,
        is_temporary=is_temporary,
        account_status=CustomerAccountStatus.ACTIVE,
        is_active=True,
        default_currency_id=default_currency_id,
        receivables_account_id=receivables_account_id,
        created_by_user_id=created_by_user_id,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


async def list_customer_sales_invoices(
    db: AsyncSession, *, customer_id: int, limit: int = 50, offset: int = 0
) -> tuple[list[SalesInvoice], int]:
    await get_customer_or_404(db, customer_id)
    filt = (SalesInvoice.customer_id == customer_id) & (SalesInvoice.voided_at.is_(None))
    cnt = await db.execute(select(func.count()).select_from(SalesInvoice).where(filt))
    total = int(cnt.scalar_one() or 0)
    inv_res = await db.execute(
        select(SalesInvoice)
        .where(filt)
        .order_by(SalesInvoice.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(inv_res.scalars().all()), total
