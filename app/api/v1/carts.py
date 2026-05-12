"""POS cart APIs."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.pos_cart import (
    CartCreateRequest,
    CartDiscountRequest,
    CartLineUpsertRequest,
    CartRead,
    CartStateRequest,
)
from app.services import audit_service
from app.services.cart_service import (
    apply_discount,
    change_state,
    create_cart,
    read_cart_as_schema,
    upsert_line,
)

router = APIRouter()


@router.get("/pos/carts/{cart_id}", response_model=CartRead)
async def get_cart_endpoint(
    cart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_carts", "read"),
) -> CartRead:
    return await read_cart_as_schema(db, cart_id=cart_id)


@router.post("/pos/carts", response_model=CartRead, status_code=status.HTTP_201_CREATED)
async def create_cart_endpoint(
    body: CartCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_carts", "create"),
) -> CartRead:
    cart = await create_cart(
        db,
        terminal_id=body.terminal_id,
        shift_id=body.shift_id,
        customer_id=body.customer_id,
    )
    await audit_service.log(
        session=db,
        action="pos_cart.created",
        resource_type="pos_cart",
        resource_id=str(cart.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await read_cart_as_schema(db, cart_id=cart.id)


@router.post("/pos/carts/{cart_id}/lines", response_model=CartRead)
async def upsert_line_endpoint(
    cart_id: int,
    body: CartLineUpsertRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_carts", "update"),
) -> CartRead:
    cart = await upsert_line(
        db,
        cart_id=cart_id,
        product_id=body.product_id,
        qty=body.qty,
        created_by_user_id=current_user.id,
    )
    await audit_service.log(
        session=db,
        action="pos_cart.line_upserted",
        resource_type="pos_cart",
        resource_id=str(cart.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await read_cart_as_schema(db, cart_id=cart.id)


@router.post("/pos/carts/{cart_id}/discounts", response_model=CartRead)
async def apply_discount_endpoint(
    cart_id: int,
    body: CartDiscountRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_carts", "discount"),
) -> CartRead:
    cart = await apply_discount(
        db, cart_id=cart_id, code=body.code, amount=body.amount, created_by_user_id=current_user.id
    )
    await audit_service.log(
        session=db,
        action="pos_cart.discount_applied",
        resource_type="pos_cart",
        resource_id=str(cart.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await read_cart_as_schema(db, cart_id=cart.id)


@router.post("/pos/carts/{cart_id}/state", response_model=CartRead)
async def change_state_endpoint(
    cart_id: int,
    body: CartStateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("pos_carts", "update"),
) -> CartRead:
    cart = await change_state(db, cart_id=cart_id, action=body.action, user_id=current_user.id)
    await audit_service.log(
        session=db,
        action="pos_cart.state_changed",
        resource_type="pos_cart",
        resource_id=str(cart.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await read_cart_as_schema(db, cart_id=cart.id)



from pydantic import BaseModel

from app.core.errors import NotFoundError
from app.models.pos_cart import PosCart
from sqlalchemy import select

class CartCustomerPatch(BaseModel):
    customer_id: int | None

@router.patch('/pos/carts/{cart_id}', response_model=CartRead)
async def patch_cart_endpoint(
    cart_id: int,
    body: CartCustomerPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission('pos_carts', 'update'),
) -> CartRead:
    # Epic 21.5: PATCH to set customer_id
    cart_res = await db.execute(select(PosCart).where(PosCart.id == cart_id))
    cart = cart_res.scalar_one_or_none()
    if not cart:
        raise NotFoundError('Cart not found')
    if cart.status not in ('active', 'parked', 'checkout_locked'):
        raise NotFoundError('Cannot modify cart in current status')
    cart.customer_id = body.customer_id
    await db.commit()
    await db.refresh(cart)
    await audit_service.log(
        session=db,
        action='pos_cart.customer_updated',
        resource_type='pos_cart',
        resource_id=str(cart_id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return await read_cart_as_schema(db, cart_id=cart.id)



from typing import Literal
from fastapi import Query

@router.get('/pos/carts', response_model=list[CartRead])
async def list_carts_endpoint(
    status: Literal['parked', 'active', 'checkout_locked', 'paid', 'cancelled'] | None = Query(None),
    terminal_id: int | None = Query(None),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission('pos_carts', 'read'),
) -> list[CartRead]:
    '''List carts with optional filtering (Epic 21.7).'''
    query = select(PosCart)
    if status:
        query = query.where(PosCart.status == status)
    if terminal_id:
        query = query.where(PosCart.terminal_id == terminal_id)
    if branch_id:
        query = query.where(PosCart.branch_id == branch_id)
    query = query.order_by(PosCart.updated_at.desc())
    result = await db.execute(query)
    carts = result.scalars().all()
    return [await read_cart_as_schema(db, cart_id=cart.id) for cart in carts]
