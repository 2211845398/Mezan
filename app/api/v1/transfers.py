"""Transfer batches API (Epic 2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.branch import Branch
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.transfer_batch import TransferBatch
from app.models.users import User
from app.schemas.transfers import (
    TransferBatchCreate,
    TransferBatchRead,
    TransferBatchUpdate,
    TransferLineRead,
)
from app.utils.person_name import person_name_sql_expr
from app.utils.variant_display import variant_attributes_summary, variant_value_labels_summary
from app.services import audit_service
from app.services.product_uom_service import uom_map_for_ids
from app.services.transfer_service import (
    cancel_pending_batch,
    create_batch,
    dispatch_batch,
    get_batch,
    list_batches,
    receive_batch,
    update_pending_batch,
)

router = APIRouter()


async def _transfer_batches_to_read(db: AsyncSession, batches: list[TransferBatch]) -> list[TransferBatchRead]:
    if not batches:
        return []
    bids: set[int] = set()
    pids: set[int] = set()
    vids: set[int] = set()
    uids: set[int] = set()
    uom_ids: set[int] = set()
    for b in batches:
        bids.add(b.from_branch_id)
        bids.add(b.to_branch_id)
        if b.created_by_user_id is not None:
            uids.add(b.created_by_user_id)
        for ln in b.lines:
            pids.add(ln.product_id)
            vids.add(ln.variant_id)
            uom_ids.add(ln.uom_id)

    bmap: dict[int, str] = {}
    if bids:
        res = await db.execute(select(Branch.id, Branch.name).where(Branch.id.in_(bids)))
        bmap = {int(i): str(n) for i, n in res.all()}
    pmap: dict[int, str] = {}
    if pids:
        res = await db.execute(select(Product.id, Product.name).where(Product.id.in_(pids)))
        pmap = {int(i): str(n) for i, n in res.all()}
    vsku: dict[int, str] = {}
    vattr: dict[int, str] = {}
    vname: dict[int, str] = {}
    vref: dict[int, str] = {}
    if vids:
        res = await db.execute(
            select(
                ProductVariant.id,
                ProductVariant.sku,
                ProductVariant.attribute_values,
                ProductVariant.reference_code,
            ).where(ProductVariant.id.in_(vids))
        )
        for vid, sku, attrs, ref in res.all():
            iid = int(vid)
            vsku[iid] = str(sku)
            attr_dict = dict(attrs or {})
            vattr[iid] = variant_attributes_summary(attr_dict)
            vname[iid] = variant_value_labels_summary(attr_dict)
            vref[iid] = (str(ref).strip() if ref else "") or ""
    uom_map = await uom_map_for_ids(db, uom_ids)
    umap: dict[int, str] = {}
    if uids:
        res = await db.execute(
            select(
                User.id,
                person_name_sql_expr(User.first_name, User.father_name, User.family_name),
                User.email,
            ).where(User.id.in_(uids))
        )
        for uid, fn, em in res.all():
            label = (str(fn).strip() if fn else "") or (str(em).strip() if em else "")
            umap[int(uid)] = label

    out: list[TransferBatchRead] = []
    for batch in batches:
        lines: list[TransferLineRead] = []
        for ln in batch.lines:
            uom_row = uom_map.get(ln.uom_id)
            lines.append(
                TransferLineRead(
                    id=ln.id,
                    product_id=ln.product_id,
                    qty=ln.qty,
                    qty_base=ln.qty_base,
                    uom_id=ln.uom_id,
                    uom_name=uom_row.name if uom_row else "",
                    uom_code=uom_row.code if uom_row else "",
                    uom_symbol=uom_row.symbol if uom_row else "",
                    variant_id=ln.variant_id,
                    product_name=pmap.get(ln.product_id, ""),
                    variant_sku=vsku.get(ln.variant_id, ""),
                    variant_name=vname.get(ln.variant_id, ""),
                    reference_code=vref.get(ln.variant_id, ""),
                    variant_attributes=vattr.get(ln.variant_id, ""),
                )
            )
        creator_name: str | None = None
        if batch.created_by_user_id is not None:
            raw = umap.get(batch.created_by_user_id, "")
            creator_name = raw.strip() if raw and str(raw).strip() else None
        out.append(
            TransferBatchRead(
                id=batch.id,
                from_branch_id=batch.from_branch_id,
                to_branch_id=batch.to_branch_id,
                from_branch_name=bmap.get(batch.from_branch_id, ""),
                to_branch_name=bmap.get(batch.to_branch_id, ""),
                status=batch.status,
                created_by_user_id=batch.created_by_user_id,
                created_by_user_name=creator_name,
                dispatched_at=batch.dispatched_at,
                received_at=batch.received_at,
                created_at=batch.created_at,
                updated_at=batch.updated_at,
                lines=lines,
            )
        )
    return out


@router.post("/transfers", response_model=TransferBatchRead, status_code=status.HTTP_201_CREATED)
async def create_transfer_batch_endpoint(
    body: TransferBatchCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> TransferBatchRead:
    batch = await create_batch(db, created_by_user_id=current_user.id, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="transfer_batch.created",
        resource_type="transfer_batch",
        resource_id=str(batch.id),
        new_value=TransferBatchRead.model_validate(batch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    enriched = await _transfer_batches_to_read(db, [batch])
    return enriched[0]


@router.get("/transfers", response_model=list[TransferBatchRead])
async def list_transfer_batches_endpoint(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> list[TransferBatchRead]:
    rows = await list_batches(db, limit=limit, offset=offset)
    return await _transfer_batches_to_read(db, rows)


@router.put("/transfers/{batch_id}", response_model=TransferBatchRead)
async def update_transfer_batch_endpoint(
    batch_id: int,
    body: TransferBatchUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> TransferBatchRead:
    batch = await update_pending_batch(db, batch_id=batch_id, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="transfer_batch.updated",
        resource_type="transfer_batch",
        resource_id=str(batch.id),
        new_value=TransferBatchRead.model_validate(batch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    enriched = await _transfer_batches_to_read(db, [batch])
    return enriched[0]


@router.get("/transfers/{batch_id}", response_model=TransferBatchRead)
async def get_transfer_batch_endpoint(
    batch_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("inventory", "read"),
) -> TransferBatchRead:
    batch = await get_batch(db, batch_id)
    enriched = await _transfer_batches_to_read(db, [batch])
    return enriched[0]


@router.delete("/transfers/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_transfer_batch_endpoint(
    batch_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> None:
    await cancel_pending_batch(db, batch_id=batch_id, actor_branch_id=current_user.branch_id)
    await audit_service.log(
        session=db,
        action="transfer_batch.cancelled",
        resource_type="transfer_batch",
        resource_id=str(batch_id),
        new_value={"batch_id": batch_id},
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


@router.post("/transfers/{batch_id}/dispatch", response_model=TransferBatchRead)
async def dispatch_transfer_batch_endpoint(
    batch_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> TransferBatchRead:
    batch = await dispatch_batch(db, batch_id=batch_id, actor_branch_id=current_user.branch_id)
    await audit_service.log(
        session=db,
        action="transfer_batch.dispatched",
        resource_type="transfer_batch",
        resource_id=str(batch.id),
        new_value=TransferBatchRead.model_validate(batch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    enriched = await _transfer_batches_to_read(db, [batch])
    return enriched[0]


@router.post("/transfers/{batch_id}/receive", response_model=TransferBatchRead)
async def receive_transfer_batch_endpoint(
    batch_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("inventory", "update"),
) -> TransferBatchRead:
    batch = await receive_batch(db, batch_id=batch_id, actor_branch_id=current_user.branch_id)
    await audit_service.log(
        session=db,
        action="transfer_batch.received",
        resource_type="transfer_batch",
        resource_id=str(batch.id),
        new_value=TransferBatchRead.model_validate(batch).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    enriched = await _transfer_batches_to_read(db, [batch])
    return enriched[0]
