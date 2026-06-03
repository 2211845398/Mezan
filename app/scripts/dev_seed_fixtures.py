"""Rich development fixtures (customers, suppliers, POs, POS, HR, payroll)."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance_log import AttendanceLog
from app.models.branch import Branch
from app.models.customer_profile import CustomerProfile
from app.models.employee_profile import EmployeeProfile
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
from app.services.customer_crm_service import create_staff_customer
from app.services.document_posting_service import post_sales_invoice_gl
from app.services.employee_service import clock_in, clock_out, create_employee_profile
from app.services.goods_receipt_service import receive_goods_for_purchase_order
from app.services.payroll_service import prepare_payroll_period_drafts
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


async def seed_dev_employees_and_attendance(
    db: AsyncSession,
    *,
    primary_branch: Branch,
    dev_password: str,
) -> None:
    today = date.today()
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
        if res_emp.scalar_one_or_none() is None:
            await create_employee_profile(
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

        res_emp = await db.execute(
            select(EmployeeProfile).where(EmployeeProfile.user_id == user.id)
        )
        employee = res_emp.scalar_one()
        res_log = await db.execute(
            select(AttendanceLog).where(AttendanceLog.employee_profile_id == employee.id)
        )
        if res_log.scalar_one_or_none() is not None:
            continue

        yesterday = datetime.now(UTC) - timedelta(days=1)
        clock_in_at = yesterday.replace(hour=9, minute=0, second=0, microsecond=0)
        clock_out_at = yesterday.replace(hour=17, minute=0, second=0, microsecond=0)
        await clock_in(
            db,
            employee_profile_id=employee.id,
            branch_id=primary_branch.id,
            clock_in_at=clock_in_at,
        )
        await clock_out(
            db,
            employee_profile_id=employee.id,
            clock_out_at=clock_out_at,
        )

    logger.info("Seeded dev employees and attendance logs.")


async def seed_dev_payroll(db: AsyncSession) -> None:
    today = date.today()
    result = await prepare_payroll_period_drafts(db, year=today.year, month=today.month)
    logger.info(
        "Payroll drafts for %s-%02d: created=%s skipped=%s.",
        today.year,
        today.month,
        result.get("created_count"),
        result.get("skipped_existing_count"),
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
    await seed_dev_employees_and_attendance(
        db,
        primary_branch=primary,
        dev_password=dev_password,
    )
    await seed_dev_payroll(db)
