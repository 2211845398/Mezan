"""Customer onboarding and CRM APIs."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.customer_profile import (
    CustomerCompleteOnboardingRequest,
    CustomerCreateStaff,
    CustomerCreateTemporaryRequest,
    CustomerDetailRead,
    CustomerListItemRead,
    CustomerListResponse,
    CustomerRead,
    CustomerSalesInvoiceListItem,
    CustomerSalesInvoiceListResponse,
    CustomerUpdate,
)
from app.services import audit_service
from app.services.customer_crm_service import (
    create_staff_customer,
    get_customer_detail_metrics,
    list_customer_sales_invoices,
    list_customers,
    update_customer_profile,
)
from app.services.customer_service import complete_onboarding, create_temporary_customer

router = APIRouter()


@router.post("/customers/temporary", status_code=status.HTTP_201_CREATED)
async def create_temporary_customer_endpoint(
    body: CustomerCreateTemporaryRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("customers", "create"),
) -> dict:
    customer, token = await create_temporary_customer(
        db, phone=body.phone, created_by_user_id=current_user.id
    )
    await audit_service.log(
        session=db,
        action="customer.temporary_created",
        resource_type="customer_profile",
        resource_id=str(customer.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return {
        "customer": CustomerRead.model_validate(customer).model_dump(),
        "onboarding_token": token,
        "onboarding_path": f"/customer-onboarding?token={token}",
        "qr_url": f"/api/v1/customers/onboarding/complete?token={token}",
    }


@router.post("/customers/onboarding/complete", response_model=CustomerRead)
async def complete_onboarding_endpoint(
    body: CustomerCompleteOnboardingRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CustomerRead:
    customer = await complete_onboarding(
        db,
        token=body.token,
        first_name=body.first_name,
        father_name=body.father_name,
        family_name=body.family_name,
        email=body.email,
    )
    await audit_service.log(
        session=db,
        action="customer.onboarding_completed",
        resource_type="customer_profile",
        resource_id=str(customer.id),
        request=request,
    )
    await db.commit()
    return CustomerRead.model_validate(customer)


@router.get("/customers", response_model=CustomerListResponse)
async def list_customers_endpoint(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, max_length=128),
    activation: Literal["all", "active", "pending", "suspended"] = Query("all"),
    pos_ready: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("customers", "read"),
) -> CustomerListResponse:
    rows, total = await list_customers(
        db,
        limit=limit,
        offset=offset,
        search=search,
        pos_ready=pos_ready,
        activation=activation,
    )
    items = [
        CustomerListItemRead(
            id=c.id,
            phone=c.phone,
            first_name=c.first_name,
            father_name=c.father_name,
            family_name=c.family_name,
            email=c.email,
            is_temporary=c.is_temporary,
            is_active=c.is_active,
            account_status=c.account_status.value,
            loyalty_balance=bal,
            lifetime_spend=spend,
        )
        for c, bal, spend in rows
    ]
    return CustomerListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/customers", response_model=CustomerDetailRead, status_code=status.HTTP_201_CREATED)
async def create_customer_staff_endpoint(
    body: CustomerCreateStaff,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("customers", "create"),
) -> CustomerDetailRead:
    c = await create_staff_customer(
        db,
        phone=body.phone,
        first_name=body.first_name,
        father_name=body.father_name,
        family_name=body.family_name,
        email=body.email,
        is_temporary=body.is_temporary,
        default_currency_id=body.default_currency_id,
        receivables_account_id=body.receivables_account_id,
        created_by_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="customer.created",
        resource_type="customer_profile",
        resource_id=str(c.id),
        new_value={"phone": c.phone, "first_name": c.first_name},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(c)
    bal = 0
    spend = Decimal("0")
    return CustomerDetailRead(
        id=c.id,
        phone=c.phone,
        first_name=c.first_name,
        father_name=c.father_name,
        family_name=c.family_name,
        email=c.email,
        is_temporary=c.is_temporary,
        is_active=c.is_active,
        account_status=c.account_status.value,
        default_currency_id=c.default_currency_id,
        receivables_account_id=c.receivables_account_id,
        created_at=c.created_at,
        updated_at=c.updated_at,
        loyalty_balance=bal,
        lifetime_spend=spend,
    )


@router.get(
    "/customers/{customer_id}/sales-invoices", response_model=CustomerSalesInvoiceListResponse
)
async def list_customer_sales_invoices_endpoint(
    customer_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("customers", "read"),
) -> CustomerSalesInvoiceListResponse:
    invoices, total = await list_customer_sales_invoices(
        db, customer_id=customer_id, limit=limit, offset=offset
    )
    items = [
        CustomerSalesInvoiceListItem(
            id=inv.id,
            invoice_number=inv.invoice_number,
            invoice_barcode=inv.invoice_barcode,
            cart_id=inv.cart_id,
            terminal_id=inv.terminal_id,
            branch_id=inv.branch_id,
            subtotal=inv.subtotal,
            discount_total=inv.discount_total,
            tax_total=inv.tax_total,
            total=inv.total,
            created_at=inv.created_at,
        )
        for inv in invoices
    ]
    return CustomerSalesInvoiceListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/customers/{customer_id}", response_model=CustomerDetailRead)
async def get_customer_endpoint(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("customers", "read"),
) -> CustomerDetailRead:
    c, bal, spend = await get_customer_detail_metrics(db, customer_id)
    return CustomerDetailRead(
        id=c.id,
        phone=c.phone,
        first_name=c.first_name,
        father_name=c.father_name,
        family_name=c.family_name,
        email=c.email,
        is_temporary=c.is_temporary,
        is_active=c.is_active,
        account_status=c.account_status.value,
        default_currency_id=c.default_currency_id,
        receivables_account_id=c.receivables_account_id,
        created_at=c.created_at,
        updated_at=c.updated_at,
        loyalty_balance=bal,
        lifetime_spend=spend,
    )


@router.patch("/customers/{customer_id}", response_model=CustomerDetailRead)
async def update_customer_endpoint(
    customer_id: int,
    body: CustomerUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("customers", "update"),
) -> CustomerDetailRead:
    data = body.model_dump(exclude_unset=True)
    c = await update_customer_profile(db, customer_id=customer_id, data=data)
    await audit_service.log(
        session=db,
        action="customer.updated",
        resource_type="customer_profile",
        resource_id=str(customer_id),
        new_value=data,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(c)
    _, bal, spend = await get_customer_detail_metrics(db, customer_id)
    return CustomerDetailRead(
        id=c.id,
        phone=c.phone,
        first_name=c.first_name,
        father_name=c.father_name,
        family_name=c.family_name,
        email=c.email,
        is_temporary=c.is_temporary,
        is_active=c.is_active,
        account_status=c.account_status.value,
        default_currency_id=c.default_currency_id,
        receivables_account_id=c.receivables_account_id,
        created_at=c.created_at,
        updated_at=c.updated_at,
        loyalty_balance=bal,
        lifetime_spend=spend,
    )
