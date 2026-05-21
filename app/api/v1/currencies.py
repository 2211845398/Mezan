"""Currency master and accounting settings API."""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.currencies import (
    AccountingSettingsRead,
    AccountingSettingsUpdate,
    CurrencyCreate,
    CurrencyRateUpdate,
    CurrencyRead,
    CurrencyUpdate,
)
from app.services import audit_service
from app.services.currency_service import (
    create_currency,
    get_accounting_settings_read,
    list_currencies,
    update_base_currency,
    update_currency,
    update_currency_rate,
)

router = APIRouter()


@router.get("/accounting/currencies", response_model=list[CurrencyRead])
async def list_currencies_endpoint(
    active_only: bool = Query(default=True),
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[CurrencyRead]:
    return await list_currencies(db, active_only=active_only, include_inactive=include_inactive)


@router.post(
    "/accounting/currencies",
    response_model=CurrencyRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_currency_endpoint(
    body: CurrencyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> CurrencyRead:
    row = await create_currency(db, body)
    await audit_service.log(
        session=db,
        action="currency.create",
        resource_type="currency",
        resource_id=str(row.id),
        user_id=current_user.id,
        request=request,
        details={"code": row.code},
    )
    await db.commit()
    return row


@router.patch("/accounting/currencies/{currency_id}", response_model=CurrencyRead)
async def update_currency_endpoint(
    currency_id: int,
    body: CurrencyUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> CurrencyRead:
    row = await update_currency(db, currency_id, body)
    await audit_service.log(
        session=db,
        action="currency.update",
        resource_type="currency",
        resource_id=str(currency_id),
        user_id=current_user.id,
        request=request,
        details=body.model_dump(exclude_unset=True),
    )
    await db.commit()
    return row


@router.patch("/accounting/currencies/{currency_id}/rate", response_model=CurrencyRead)
async def update_currency_rate_endpoint(
    currency_id: int,
    body: CurrencyRateUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> CurrencyRead:
    row = await update_currency_rate(db, currency_id, body)
    await audit_service.log(
        session=db,
        action="currency.rate_update",
        resource_type="currency",
        resource_id=str(currency_id),
        user_id=current_user.id,
        request=request,
        details={"exchange_rate_to_base": str(body.exchange_rate_to_base)},
    )
    await db.commit()
    return row


@router.get("/accounting/settings", response_model=AccountingSettingsRead)
async def get_accounting_settings_endpoint(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> AccountingSettingsRead:
    return await get_accounting_settings_read(db)


@router.patch("/accounting/settings", response_model=AccountingSettingsRead)
async def update_accounting_settings_endpoint(
    body: AccountingSettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> AccountingSettingsRead:
    row = await update_base_currency(db, base_currency_id=body.base_currency_id)
    await audit_service.log(
        session=db,
        action="accounting_settings.update",
        resource_type="accounting_settings",
        resource_id="1",
        user_id=current_user.id,
        request=request,
        details={"base_currency_id": body.base_currency_id},
    )
    await db.commit()
    return row
