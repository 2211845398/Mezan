"""Hybrid onboarding APIs."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.customer_profile import (
    CustomerCompleteOnboardingRequest,
    CustomerCreateTemporaryRequest,
    CustomerRead,
)
from app.services import audit_service
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
        "qr_url": f"/api/v1/customers/onboarding/complete?token={token}",
    }


@router.post("/customers/onboarding/complete", response_model=CustomerRead)
async def complete_onboarding_endpoint(
    body: CustomerCompleteOnboardingRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CustomerRead:
    customer = await complete_onboarding(
        db, token=body.token, full_name=body.full_name, email=body.email
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
