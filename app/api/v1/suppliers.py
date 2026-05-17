"""Supplier master API (Epic 5 + W-5.4)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.suppliers import SupplierCreate, SupplierRead, SupplierUpdate
from app.services.supplier_service import (
    create_supplier,
    get_supplier,
    list_suppliers,
    update_supplier,
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
        payables_account_id=body.payables_account_id,
        tax_id=body.tax_id,
        contact=body.contact,
        payment_terms=body.payment_terms,
    )
    return SupplierRead.model_validate(s)


@router.get("/suppliers", response_model=list[SupplierRead])
async def list_suppliers_endpoint(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "read"),
) -> list[SupplierRead]:
    rows = await list_suppliers(db)
    return [SupplierRead.model_validate(r) for r in rows]


@router.get("/suppliers/{supplier_id}", response_model=SupplierRead)
async def get_supplier_endpoint(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "read"),
) -> SupplierRead:
    s = await get_supplier(db, supplier_id)
    return SupplierRead.model_validate(s)


@router.patch("/suppliers/{supplier_id}", response_model=SupplierRead)
async def update_supplier_endpoint(
    supplier_id: int,
    body: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("suppliers", "update"),
) -> SupplierRead:
    s = await update_supplier(db, supplier_id=supplier_id, data=body.model_dump(exclude_unset=True))
    return SupplierRead.model_validate(s)
