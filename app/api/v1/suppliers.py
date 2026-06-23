"""Supplier master API (Epic 5 + W-5.4)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.currency import Currency
from app.models.users import User
from app.schemas.supplier_statement import SupplierEvaluationRead, SupplierStatementRead
from app.schemas.suppliers import SupplierCreate, SupplierListResponse, SupplierRead, SupplierUpdate
from app.services.supplier_service import (
    create_supplier,
    get_supplier_read,
    list_suppliers_read,
    supplier_to_read,
    update_supplier,
)
from app.services.supplier_statement_service import (
    get_supplier_evaluation,
    get_supplier_statement,
)

router = APIRouter()


@router.post("/suppliers", response_model=SupplierRead)
async def create_supplier_endpoint(
    body: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "create"),
) -> SupplierRead:
    s = await create_supplier(
        db,
        code=body.code,
        first_name=body.first_name,
        father_name=body.father_name,
        family_name=body.family_name,
        currency_id=body.currency_id,
        currency_code=body.currency_code,
        payables_account_id=body.payables_account_id,
        tax_id=body.tax_id,
        contact=body.contact,
        payment_terms=body.payment_terms,
        payment_terms_id=body.payment_terms_id,
    )
    cur_res = await db.execute(select(Currency).where(Currency.id == s.currency_id))
    cur = cur_res.scalar_one_or_none()
    return supplier_to_read(s, cur)


@router.get("/suppliers", response_model=SupplierListResponse)
async def list_suppliers_endpoint(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "read"),
) -> SupplierListResponse:
    items, total = await list_suppliers_read(db, limit=limit, offset=offset)
    return SupplierListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/suppliers/{supplier_id}", response_model=SupplierRead)
async def get_supplier_endpoint(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "read"),
) -> SupplierRead:
    return await get_supplier_read(db, supplier_id)


@router.get("/suppliers/{supplier_id}/statement", response_model=SupplierStatementRead)
async def supplier_statement_endpoint(
    supplier_id: int,
    date_from: date = Query(...),
    date_to: date = Query(...),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "read"),
) -> SupplierStatementRead:
    return await get_supplier_statement(
        db,
        supplier_id=supplier_id,
        date_from=date_from,
        date_to=date_to,
        branch_id=branch_id,
    )


@router.get("/suppliers/{supplier_id}/evaluation", response_model=SupplierEvaluationRead)
async def supplier_evaluation_endpoint(
    supplier_id: int,
    period_days: int = Query(default=365, ge=1, le=3650),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "read"),
) -> SupplierEvaluationRead:
    return await get_supplier_evaluation(
        db,
        supplier_id=supplier_id,
        period_days=period_days,
        date_from=date_from,
        date_to=date_to,
        branch_id=branch_id,
    )


@router.patch("/suppliers/{supplier_id}", response_model=SupplierRead)
async def update_supplier_endpoint(
    supplier_id: int,
    body: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "update"),
) -> SupplierRead:
    await update_supplier(db, supplier_id=supplier_id, data=body.model_dump(exclude_unset=True))
    return await get_supplier_read(db, supplier_id)
