"""Supplier master API (Epic 5)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.suppliers import SupplierCreate, SupplierRead
from app.services.supplier_service import create_supplier, list_suppliers

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
        name=body.name,
        currency_id=body.currency_id,
        payables_account_id=body.payables_account_id,
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
