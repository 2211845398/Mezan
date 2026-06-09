"""Rich development fixtures (customers, suppliers, POs, POS, HR, payroll)."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance_device import AttendanceDevice
from app.models.attendance_log import AttendanceLog
from app.models.branch import Branch
from app.models.customer_profile import CustomerProfile
from app.models.employee_profile import EmployeeProfile
from app.models.hr_feedback import HrFeedback
from app.models.leave_request import LeaveRequest
from app.models.notifications import NotificationDelivery, NotificationStatus
from app.models.pos_cart import PosCart
from app.models.pos_shift import PosShift
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.purchase_order import PurchaseOrder
from app.models.role import Role
from app.models.sales_invoice import InvoicePayment, SalesInvoice, SalesInvoiceLine
from app.models.suppliers import Supplier
from app.models.user_role import UserRole
from app.models.users import User
from app.models.weekly_schedule import WeeklySchedule
from app.services.customer_crm_service import create_staff_customer
from app.services.document_posting_service import post_sales_invoice_gl
from app.services.employee_service import (
    clock_in,
    clock_out,
    create_employee_profile,
    create_leave_request,
    create_weekly_schedule,
    review_leave_request,
)
from app.services.goods_receipt_service import receive_goods_for_purchase_order
from app.services.attendance_device_service import create_attendance_device, ensure_kiosk_role_for_user
from app.services.hr_feedback_service import create_hr_feedback
from app.services.payroll_service import (
    approve_and_pay_period,
    calendar_month_period_bounds,
    prepare_payroll_period_drafts,
)
from app.services.purchase_order_service import create_po, mark_po_sent
from app.services.shift_service import close_shift, open_shift
from app.services.supplier_service import create_supplier
from app.utils.security import hash_password

logger = logging.getLogger(__name__)

_CUSTOMER_SPECS: list[dict[str, str | bool | None]] = [
    {
        "phone": "+15550001001",
        "first_name": "Layla",
        "father_name": None,
        "family_name": "Hassan",
        "email": "layla.dev@example.com",
        "is_temporary": False,
    },
    {
        "phone": "+15550001002",
        "first_name": "Omar",
        "father_name": "Ali",
        "family_name": "Saleh",
        "email": None,
        "is_temporary": False,
    },
    {
        "phone": "+15550001003",
        "first_name": "Walk-in",
        "father_name": None,
        "family_name": "Guest",
        "email": None,
        "is_temporary": True,
    },
]

_SUPPLIER_SPECS: list[dict[str, str | None]] = [
    {"code": "SUP-DEV-001", "first_name": "Fresh", "family_name": "Foods Ltd"},
    {"code": "SUP-DEV-002", "first_name": "Metro", "family_name": "Wholesale"},
]

_EMPLOYEE_USER_SPECS: list[dict[str, str | Decimal]] = [
    {
        "email": "cashier.dev@example.com",
        "first_name": "Dev",
        "family_name": "Cashier",
        "role_code": "CASHIER",
        "base_salary": Decimal("2800.00"),
    },
    {
        "email": "hr.dev@example.com",
        "first_name": "Dev",
        "family_name": "HR",
        "role_code": "HR_MANAGER",
        "base_salary": Decimal("4200.00"),
    },
    {
        "email": "floor.dev@example.com",
        "first_name": "Dev",
        "family_name": "Floor",
        "role_code": "FLOOR_STAFF",
        "base_salary": Decimal("2400.00"),
    },
]

# weekday 0=Mon ... 6=Sun; Fri/Sat off
_WORK_WEEK: list[tuple[int, bool, time, time]] = [
    (0, False, time(9, 0), time(17, 0)),
    (1, False, time(9, 0), time(17, 0)),
    (2, False, time(9, 0), time(17, 0)),
    (3, False, time(9, 0), time(17, 0)),
    (4, True, time(0, 0), time(0, 0)),
    (5, True, time(0, 0), time(0, 0)),
    (6, False, time(9, 0), time(17, 0)),
]


async def _first_variant_for_sku(db: AsyncSession, sku: str) -> tuple[Product, ProductVariant]:
    res = await db.execute(select(Product).where(Product.sku == sku))
    product = res.scalar_one()
    res_pv = await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
    )
    variant = res_pv.scalar_one()
    return product, variant


async def _terminal_for_branch(db: AsyncSession, branch_code: str) -> POSTerminal:
    term_code = f"DEV-TERM-{branch_code}"
    res = await db.execute(select(POSTerminal).where(POSTerminal.terminal_code == term_code))
    return res.scalar_one()


async def seed_dev_customers(
    db: AsyncSession,
    *,
    admin_user_id: int,
    currency_id: int,
) -> list[int]:
    customer_ids: list[int] = []
    created_count = 0
    for spec in _CUSTOMER_SPECS:
        phone = str(spec["phone"])
        res = await db.execute(select(CustomerProfile).where(CustomerProfile.phone == phone))
        existing = res.scalar_one_or_none()
        if existing is not None:
            customer_ids.append(existing.id)
            continue
        customer = await create_staff_customer(
            db,
            phone=phone,
            first_name=spec.get("first_name"),  # type: ignore[arg-type]
            father_name=spec.get("father_name"),  # type: ignore[arg-type]
            family_name=spec.get("family_name"),  # type: ignore[arg-type]
            email=spec.get("email"),  # type: ignore[arg-type]
            is_temporary=bool(spec["is_temporary"]),
            default_currency_id=currency_id,
            receivables_account_id=None,
            created_by_user_id=admin_user_id,
        )
        customer_ids.append(customer.id)
        created_count += 1
    if created_count:
        logger.info("Seeded %s dev customers.", created_count)
    return customer_ids


async def seed_dev_suppliers(db: AsyncSession) -> list[int]:
    created: list[int] = []
    for spec in _SUPPLIER_SPECS:
        code = str(spec["code"])
        res = await db.execute(select(Supplier).where(Supplier.code == code))
        if res.scalar_one_or_none() is not None:
            continue
        supplier = await create_supplier(
            db,
            code=code,
            first_name=str(spec["first_name"]),
            father_name=None,
            family_name=str(spec["family_name"]),
            currency_id=None,
            currency_code="USD",
            payables_account_id=None,
            tax_id=None,
            contact={},
            payment_terms_id=None,
            payment_terms=None,
        )
        created.append(supplier.id)
    if created:
        logger.info("Seeded %s dev suppliers.", len(created))
    return created


async def seed_dev_purchase_orders(
    db: AsyncSession,
    *,
    branch: Branch,
    admin_user_id: int,
) -> None:
    res = await db.execute(select(Supplier).where(Supplier.code == "SUP-DEV-001"))
    supplier = res.scalar_one_or_none()
    if supplier is None:
        return
    res_po = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.supplier_id == supplier.id,
            PurchaseOrder.branch_id == branch.id,
        )
    )
    if res_po.scalar_one_or_none() is not None:
        return

    product, variant = await _first_variant_for_sku(db, "DEV-RICE-5KG")
    po = await create_po(
        db,
        created_by_user_id=admin_user_id,
        data={
            "supplier_id": supplier.id,
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 10}],
        },
    )
    await mark_po_sent(db, po_id=po.id)
    pol_id = po.lines[0].id
    await receive_goods_for_purchase_order(
        db,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 10, "unit_cost": Decimal("12.00")}],
        idempotency_key=f"dev-gr-{po.id}",
        created_by_user_id=admin_user_id,
    )
    logger.info("Seeded dev purchase order %s with goods receipt.", po.id)


async def seed_dev_pos_shifts_and_invoices(
    db: AsyncSession,
    *,
    branch: Branch,
    admin_user: User,
    customer_ids: list[int],
) -> None:
    terminal = await _terminal_for_branch(db, branch.code)
    product, variant = await _first_variant_for_sku(db, "DEV-WATER-500")
    customer_id = customer_ids[0] if customer_ids else None

    res_shift = await db.execute(
        select(PosShift).where(
            PosShift.terminal_id == terminal.id,
            PosShift.status == "closed",
        )
    )
    if res_shift.scalar_one_or_none() is not None:
        return

    shift = await open_shift(
        db,
        terminal_id=terminal.id,
        opening_float=Decimal("100.00"),
        opened_by_user_id=admin_user.id,
    )

    subtotal = Decimal("15.00")
    cart = PosCart(
        terminal_id=terminal.id,
        branch_id=branch.id,
        shift_id=shift.id,
        customer_id=customer_id,
        status="paid",
        subtotal=subtotal,
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=subtotal,
    )
    db.add(cart)
    await db.flush()

    invoice = SalesInvoice(
        invoice_number=f"DEV-INV-{uuid.uuid4().hex[:8].upper()}",
        invoice_barcode=f"DEV-BC-{uuid.uuid4().hex[:8]}",
        cart_id=cart.id,
        terminal_id=terminal.id,
        branch_id=branch.id,
        customer_id=customer_id,
        subtotal=subtotal,
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=subtotal,
        amount_paid=subtotal,
        rounding_difference=Decimal("0.00"),
        created_by_user_id=admin_user.id,
    )
    db.add(invoice)
    await db.flush()
    db.add(
        SalesInvoiceLine(
            sales_invoice_id=invoice.id,
            product_id=product.id,
            variant_id=variant.id,
            qty=10,
            unit_price=Decimal("1.50"),
            line_total=subtotal,
            tax_rate=Decimal("0"),
            line_tax_amount=Decimal("0"),
        )
    )
    db.add(
        InvoicePayment(
            sales_invoice_id=invoice.id,
            payment_intent_id=None,
            amount=subtotal,
            method="cash",
            reference=None,
        )
    )
    await db.flush()
    sil_res = await db.execute(
        select(SalesInvoiceLine).where(SalesInvoiceLine.sales_invoice_id == invoice.id)
    )
    await post_sales_invoice_gl(db, invoice=invoice, lines=list(sil_res.scalars().all()))

    await close_shift(
        db,
        shift_id=shift.id,
        declared_cash=Decimal("115.00"),
        closed_by_user_id=admin_user.id,
    )
    logger.info("Seeded closed POS shift %s and sales invoice %s.", shift.id, invoice.id)


async def _ensure_dev_employee_users(
    db: AsyncSession,
    *,
    primary_branch: Branch,
    dev_password: str,
) -> list[tuple[User, EmployeeProfile]]:
    today = date.today()
    out: list[tuple[User, EmployeeProfile]] = []
    for spec in _EMPLOYEE_USER_SPECS:
        email = str(spec["email"])
        res_u = await db.execute(select(User).where(User.email == email))
        user = res_u.scalar_one_or_none()
        if user is None:
            user = User(
                email=email,
                first_name=str(spec["first_name"]),
                father_name=None,
                family_name=str(spec["family_name"]),
                password_hash=hash_password(dev_password),
                status="active",
                branch_id=primary_branch.id,
                preferred_language="en",
            )
            db.add(user)
            await db.flush()
            res_role = await db.execute(select(Role).where(Role.code == str(spec["role_code"])))
            role = res_role.scalar_one()
            db.add(UserRole(user_id=user.id, role_id=role.id, branch_id=primary_branch.id))
            await db.flush()

        res_emp = await db.execute(
            select(EmployeeProfile).where(EmployeeProfile.user_id == user.id)
        )
        employee = res_emp.scalar_one_or_none()
        if employee is None:
            employee = await create_employee_profile(
                db,
                data={
                    "user_id": user.id,
                    "hire_date": today - timedelta(days=90),
                    "base_salary": spec["base_salary"],
                    "hourly_rate": None,
                    "bank_account": None,
                    "annual_leave_entitlement_days": Decimal("21"),
                },
            )
        out.append((user, employee))
    logger.info("Seeded %s dev employee users.", len(out))
    return out


async def seed_dev_weekly_schedules(
    db: AsyncSession,
    *,
    employees: list[EmployeeProfile],
    branch_id: int,
) -> None:
    created = 0
    for employee in employees:
        for weekday, is_day_off, start_t, end_t in _WORK_WEEK:
            res = await db.execute(
                select(WeeklySchedule).where(
                    WeeklySchedule.employee_profile_id == employee.id,
                    WeeklySchedule.weekday == weekday,
                )
            )
            if res.scalar_one_or_none() is not None:
                continue
            await create_weekly_schedule(
                db,
                employee_profile_id=employee.id,
                data={
                    "branch_id": branch_id,
                    "weekday": weekday,
                    "start_time": start_t,
                    "end_time": end_t,
                    "is_day_off": is_day_off,
                },
            )
            created += 1
    if created:
        logger.info("Seeded %s weekly schedule rows.", created)


def _is_work_day(day: date) -> bool:
    weekday = day.weekday()  # Mon=0
    for w, is_off, _, _ in _WORK_WEEK:
        if w == weekday:
            return not is_off
    return False


async def seed_dev_full_month_attendance(
    db: AsyncSession,
    *,
    employees: list[EmployeeProfile],
    branch_id: int,
) -> None:
    today = date.today()
    month_start = today.replace(day=1)
    seeded_days = 0
    for employee in employees:
        res = await db.execute(
            select(func.count())
            .select_from(AttendanceLog)
            .where(AttendanceLog.employee_profile_id == employee.id)
        )
        if (res.scalar_one() or 0) >= 10:
            continue

        day = month_start
        while day < today:
            if not _is_work_day(day):
                day += timedelta(days=1)
                continue
            # One approved leave day for cashier mid-month
            if employee.id == employees[0].id and day.day == 10:
                day += timedelta(days=1)
                continue

            clock_in_hour = 9
            clock_out_hour = 17
            if day.day == 5:
                clock_in_hour = 9
                clock_out_hour = 16  # early leave
            elif day.day == 12:
                clock_in_hour = 9
                clock_out_hour = 17
            elif day.day == 18:
                clock_in_hour = 10  # late arrival

            clock_in_at = datetime(
                day.year, day.month, day.day, clock_in_hour, 0, tzinfo=UTC
            )
            clock_out_at = datetime(
                day.year, day.month, day.day, clock_out_hour, 0, tzinfo=UTC
            )
            await clock_in(
                db,
                employee_profile_id=employee.id,
                branch_id=branch_id,
                clock_in_at=clock_in_at,
            )
            await clock_out(
                db,
                employee_profile_id=employee.id,
                clock_out_at=clock_out_at,
            )
            seeded_days += 1
            day += timedelta(days=1)

    if seeded_days:
        logger.info("Seeded %s attendance day records.", seeded_days)


async def seed_dev_leave_requests(
    db: AsyncSession,
    *,
    employees: list[EmployeeProfile],
    reviewer_user_id: int,
) -> None:
    if not employees:
        return
    cashier = employees[0]
    res = await db.execute(
        select(LeaveRequest).where(LeaveRequest.employee_profile_id == cashier.id)
    )
    if res.scalar_one_or_none() is not None:
        return

    today = date.today()
    approved = await create_leave_request(
        db,
        employee_profile_id=cashier.id,
        data={
            "leave_type": "vacation",
            "start_date": today.replace(day=10),
            "end_date": today.replace(day=10),
            "reason": "Dev seed approved leave",
        },
    )
    await review_leave_request(
        db,
        leave_request_id=approved.id,
        action="approve",
        reviewer_user_id=reviewer_user_id,
        idempotency_key="dev-seed-leave-approve-1",
    )
    pending = await create_leave_request(
        db,
        employee_profile_id=cashier.id,
        data={
            "leave_type": "vacation",
            "start_date": today + timedelta(days=14),
            "end_date": today + timedelta(days=15),
            "reason": "Dev seed pending leave",
        },
    )
    if len(employees) > 1:
        await create_leave_request(
            db,
            employee_profile_id=employees[1].id,
            data={
                "leave_type": "sick",
                "start_date": today - timedelta(days=3),
                "end_date": today - timedelta(days=3),
                "reason": "Dev seed rejected sick leave",
            },
        )
        rejected = await db.execute(
            select(LeaveRequest)
            .where(LeaveRequest.employee_profile_id == employees[1].id)
            .order_by(LeaveRequest.id.desc())
            .limit(1)
        )
        row = rejected.scalar_one()
        await review_leave_request(
            db,
            leave_request_id=row.id,
            action="reject",
            reviewer_user_id=reviewer_user_id,
            review_notes="Dev seed rejection",
            idempotency_key="dev-seed-leave-reject-1",
        )
    logger.info(
        "Seeded leave requests (approved=%s pending=%s).",
        approved.id,
        pending.id,
    )


async def seed_dev_hr_feedback(
    db: AsyncSession,
    *,
    employee_users: list[tuple[User, EmployeeProfile]],
) -> None:
    created = 0
    for user, _ in employee_users:
        res = await db.execute(select(HrFeedback).where(HrFeedback.user_id == user.id))
        if res.scalar_one_or_none() is not None:
            continue
        await create_hr_feedback(
            db,
            user_id=user.id,
            message="Dev seed feedback sample for mobile testing.",
            category="suggestion",
        )
        created += 1
    if created:
        logger.info("Seeded %s HR feedback rows.", created)


async def seed_dev_notifications(
    db: AsyncSession,
    *,
    employee_users: list[tuple[User, EmployeeProfile]],
) -> None:
    created = 0
    for user, _ in employee_users:
        key = f"dev-seed-welcome:{user.id}"
        res = await db.execute(
            select(NotificationDelivery).where(NotificationDelivery.idempotency_key == key)
        )
        if res.scalar_one_or_none() is not None:
            continue
        db.add(
            NotificationDelivery(
                schedule_id=None,
                run_id=None,
                user_id=user.id,
                device_token_id=None,
                template_kind="dev_welcome",
                idempotency_key=key,
                title="Welcome to Mezan",
                body="Your dev account has sample payroll and attendance data.",
                data={"source": "dev_seed"},
                status=NotificationStatus.SENT,
                read_at=None,
            )
        )
        created += 1
    if created:
        logger.info("Seeded %s notification deliveries.", created)


async def seed_dev_extra_invoices(
    db: AsyncSession,
    *,
    branches: list[Branch],
    admin_user: User,
    customer_ids: list[int],
) -> None:
    customer_id = customer_ids[0] if customer_ids else None
    product, variant = await _first_variant_for_sku(db, "DEV-COFFEE-1KG")
    created = 0
    for branch in branches[1:]:
        res = await db.execute(
            select(SalesInvoice).where(
                SalesInvoice.branch_id == branch.id,
                SalesInvoice.invoice_number.like(f"DEV-INV-{branch.code}-%"),
            )
        )
        if res.scalar_one_or_none() is not None:
            continue
        terminal = await _terminal_for_branch(db, branch.code)
        shift = await open_shift(
            db,
            terminal_id=terminal.id,
            opening_float=Decimal("50.00"),
            opened_by_user_id=admin_user.id,
        )
        subtotal = Decimal("24.99")
        cart = PosCart(
            terminal_id=terminal.id,
            branch_id=branch.id,
            shift_id=shift.id,
            customer_id=customer_id,
            status="paid",
            subtotal=subtotal,
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=subtotal,
        )
        db.add(cart)
        await db.flush()
        invoice = SalesInvoice(
            invoice_number=f"DEV-INV-{branch.code}-{uuid.uuid4().hex[:6].upper()}",
            invoice_barcode=f"DEV-BC-{uuid.uuid4().hex[:8]}",
            cart_id=cart.id,
            terminal_id=terminal.id,
            branch_id=branch.id,
            customer_id=customer_id,
            subtotal=subtotal,
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=subtotal,
            amount_paid=subtotal,
            rounding_difference=Decimal("0.00"),
            created_by_user_id=admin_user.id,
        )
        db.add(invoice)
        await db.flush()
        db.add(
            SalesInvoiceLine(
                sales_invoice_id=invoice.id,
                product_id=product.id,
                variant_id=variant.id,
                qty=1,
                unit_price=subtotal,
                line_total=subtotal,
                tax_rate=Decimal("0"),
                line_tax_amount=Decimal("0"),
            )
        )
        db.add(
            InvoicePayment(
                sales_invoice_id=invoice.id,
                payment_intent_id=None,
                amount=subtotal,
                method="cash",
                reference=None,
            )
        )
        await close_shift(
            db,
            shift_id=shift.id,
            declared_cash=Decimal("74.99"),
            closed_by_user_id=admin_user.id,
        )
        created += 1
    if created:
        logger.info("Seeded %s extra branch invoices.", created)


async def seed_dev_attendance_kiosk(
    db: AsyncSession,
    *,
    branch: Branch,
    dev_password: str,
) -> None:
    email = "kiosk.dev@example.com"
    res = await db.execute(select(AttendanceDevice).where(AttendanceDevice.device_code == "DEV-KIOSK-MAIN"))
    if res.scalar_one_or_none() is not None:
        return

    res_u = await db.execute(select(User).where(User.email == email))
    user = res_u.scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            first_name="Dev",
            father_name=None,
            family_name="Kiosk",
            password_hash=hash_password(dev_password),
            status="active",
            branch_id=branch.id,
            preferred_language="en",
        )
        db.add(user)
        await db.flush()
        res_role = await db.execute(select(Role).where(Role.code == "ATTENDANCE_KIOSK"))
        role = res_role.scalar_one()
        db.add(UserRole(user_id=user.id, role_id=role.id, branch_id=branch.id))
        await db.flush()

    await ensure_kiosk_role_for_user(db, user_id=user.id)
    await create_attendance_device(
        db,
        branch_id=branch.id,
        name="Main entrance kiosk",
        device_code="DEV-KIOSK-MAIN",
        user_id=user.id,
        kiosk_password=dev_password,
    )
    logger.info("Seeded attendance kiosk device for branch %s.", branch.code)


async def seed_dev_payroll(
    db: AsyncSession,
    *,
    admin_user_id: int,
) -> None:
    today = date.today()
    months: list[tuple[int, int]] = []
    if today.month == 1:
        months.append((today.year - 1, 12))
    else:
        months.append((today.year, today.month - 1))
    months.append((today.year, today.month))

    for year, month in months:
        result = await prepare_payroll_period_drafts(db, year=year, month=month)
        logger.info(
            "Payroll drafts for %s-%02d: created=%s skipped=%s.",
            year,
            month,
            result.get("created_count"),
            result.get("skipped_existing_count"),
        )

    # Approve and pay previous month only
    prev_year, prev_month = months[0]
    period_start, period_end = calendar_month_period_bounds(prev_year, prev_month)
    approved, paid = await approve_and_pay_period(
        db,
        period_start=period_start,
        period_end=period_end,
        approver_user_id=admin_user_id,
        idempotency_key="dev-seed-payroll",
    )
    logger.info(
        "Approved %s and paid %s payslips for %s-%02d.",
        len(approved),
        len(paid),
        prev_year,
        prev_month,
    )


async def seed_dev_extended_fixtures(
    db: AsyncSession,
    *,
    branches: list[Branch],
    admin_user: User,
    currency_id: int,
    dev_password: str,
) -> None:
    """Customers, suppliers, POs, POS, HR, payroll (idempotent)."""
    primary = branches[0]
    customer_ids = await seed_dev_customers(
        db,
        admin_user_id=admin_user.id,
        currency_id=currency_id,
    )
    await seed_dev_suppliers(db)
    await seed_dev_purchase_orders(db, branch=primary, admin_user_id=admin_user.id)
    await seed_dev_pos_shifts_and_invoices(
        db,
        branch=primary,
        admin_user=admin_user,
        customer_ids=customer_ids,
    )
    employee_users = await _ensure_dev_employee_users(
        db,
        primary_branch=primary,
        dev_password=dev_password,
    )
    employees = [emp for _, emp in employee_users]
    await seed_dev_weekly_schedules(db, employees=employees, branch_id=primary.id)
    await seed_dev_full_month_attendance(
        db,
        employees=employees,
        branch_id=primary.id,
    )
    await seed_dev_leave_requests(
        db,
        employees=employees,
        reviewer_user_id=admin_user.id,
    )
    await seed_dev_hr_feedback(db, employee_users=employee_users)
    await seed_dev_notifications(db, employee_users=employee_users)
    await seed_dev_extra_invoices(
        db,
        branches=branches,
        admin_user=admin_user,
        customer_ids=customer_ids,
    )
    await seed_dev_attendance_kiosk(
        db,
        branch=primary,
        dev_password=dev_password,
    )
    await seed_dev_payroll(db, admin_user_id=admin_user.id)
