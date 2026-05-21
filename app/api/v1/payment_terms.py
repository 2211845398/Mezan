"""Payment terms master API."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.payment_terms import PaymentTermCreate, PaymentTermRead, PaymentTermUpdate
from app.services.payment_terms_service import (
    create_payment_term,
    list_payment_terms,
    update_payment_term,
)

router = APIRouter()


@router.get("/accounting/payment-terms", response_model=list[PaymentTermRead])
async def list_payment_terms_endpoint(
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[PaymentTermRead]:
    return await list_payment_terms(db, active_only=active_only)


@router.post(
    "/accounting/payment-terms",
    response_model=PaymentTermRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment_term_endpoint(
    body: PaymentTermCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "update"),
) -> PaymentTermRead:
    return await create_payment_term(db, body)


@router.patch("/accounting/payment-terms/{term_id}", response_model=PaymentTermRead)
async def update_payment_term_endpoint(
    term_id: int,
    body: PaymentTermUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "update"),
) -> PaymentTermRead:
    return await update_payment_term(db, term_id, body)
