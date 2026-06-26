"""Stock count session lifecycle."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.category import Category
from app.models.role import Role
from app.models.stock_count_session import StockCountLine, StockCountSession
from app.models.stock_movement import StockMovement
from app.models.user_role import UserRole
from app.models.users import User
from app.schemas.stock_count import StockCountLineUpdate
from app.services.catalog_service import create_product
from app.services.inventory_service import apply_stock_movement
from app.services.seed_service import seed_permissions_and_roles
from app.services.stock_count_pdf_service import export_stock_count_pdf_from_session
from app.services.stock_count_session_service import (
    create_stock_count_session,
    get_my_stock_count_session,
    list_my_stock_count_sessions,
    patch_my_stock_count_lines,
    patch_stock_count_lines,
    post_stock_count_session,
)
from app.utils.security import hash_password


async def _stock_count_assignee(db_session, *, branch_id: int) -> int:
    await seed_permissions_and_roles(db_session)
    role = (await db_session.execute(select(Role).where(Role.code == "FLOOR_STAFF"))).scalar_one()
    user = User(
        email=f"count-{uuid.uuid4().hex[:8]}@test.local",
        first_name="Counter",
        password_hash=hash_password("password123"),
        status="active",
        branch_id=branch_id,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserRole(user_id=user.id, role_id=role.id, branch_id=None))
    await db_session.flush()
    return user.id


@pytest.mark.asyncio
async def test_stock_count_session_create_and_post(db_session) -> None:
    branch = Branch(
        name="Count Branch",
        code=f"CB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(
        name="Count Cat", slug=f"cc-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True
    )
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Count Product",
            "sku": f"cp-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    from app.models.product_variant import ProductVariant

    pv = (
        await db_session.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
        )
    ).scalar_one()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-count:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=10,
        reason="adjustment",
        variant_id=pv.id,
    )

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch.id)

    s1 = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
    )
    assert s1.version_no == 1
    assert s1.line_count >= 1

    s2 = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
    )
    assert s2.version_no == 2

    target = next(ln for ln in s2.lines if ln.product_id == product.id and ln.variant_id == pv.id)
    updates = [
        StockCountLineUpdate(
            id=ln.id,
            counted_qty=ln.system_on_hand + (3 if ln.id == target.id else 0),
        )
        for ln in s2.lines
    ]
    await patch_stock_count_lines(db_session, session_id=s2.id, updates=updates)

    result = await post_stock_count_session(db_session, user_id=assignee_id, session_id=s2.id)
    assert result.movements_posted >= 1

    sess = await db_session.get(StockCountSession, s2.id)
    assert sess is not None
    assert sess.status == "posted"

    mv_res = await db_session.execute(
        select(StockMovement).where(
            StockMovement.movement_kind == "count_adjust",
            StockMovement.reason == "stock_count",
        )
    )
    movements = list(mv_res.scalars().all())
    assert any(m.qty_delta == 3 for m in movements)


@pytest.mark.asyncio
async def test_stock_count_post_requires_all_lines_complete(db_session) -> None:
    branch = Branch(
        name="Incomplete Branch",
        code=f"IC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(
        name="Incomplete Cat", slug=f"ic-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True
    )
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Incomplete Product",
            "sku": f"ip-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    from app.models.product_variant import ProductVariant

    pv = (
        await db_session.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
        )
    ).scalar_one()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-incomplete:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=4,
        reason="adjustment",
        variant_id=pv.id,
    )

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch.id)

    detail = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
    )

    with pytest.raises(ValidationError, match="counted quantity"):
        await post_stock_count_session(db_session, user_id=assignee_id, session_id=detail.id)


@pytest.mark.asyncio
async def test_stock_count_post_allows_optional_damaged(db_session) -> None:
    branch = Branch(
        name="Optional Damaged Branch",
        code=f"OD-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(
        name="Optional Damaged Cat",
        slug=f"od-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Optional Damaged Product",
            "sku": f"odp-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    from app.models.product_variant import ProductVariant

    pv = (
        await db_session.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
        )
    ).scalar_one()

    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-optional-damaged:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=6,
        reason="adjustment",
        variant_id=pv.id,
    )

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch.id)

    detail = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
    )
    updates = [StockCountLineUpdate(id=ln.id, counted_qty=ln.system_on_hand) for ln in detail.lines]
    await patch_stock_count_lines(db_session, session_id=detail.id, updates=updates)

    result = await post_stock_count_session(db_session, user_id=assignee_id, session_id=detail.id)
    assert result.movements_posted == 0

    sess = await db_session.get(StockCountSession, detail.id)
    assert sess is not None
    assert sess.status == "posted"


@pytest.mark.asyncio
async def test_stock_count_lines_unique_per_session(db_session) -> None:
    branch = Branch(
        name="Count Branch 2",
        code=f"CB2-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    cat = Category(
        name="Count Cat 2", slug=f"cc2-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True
    )
    db_session.add(cat)
    await db_session.flush()

    product = await create_product(
        db_session,
        data={
            "category_id": cat.id,
            "name": "Count Product 2",
            "sku": f"cp2-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    await apply_stock_movement(
        db_session,
        idempotency_key=f"seed-count2:{product.id}",
        branch_id=branch.id,
        product_id=product.id,
        qty_delta=5,
        reason="adjustment",
    )

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch.id)

    detail = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
    )
    res = await db_session.execute(
        select(StockCountLine).where(StockCountLine.session_id == detail.id)
    )
    lines = list(res.scalars().all())
    keys = {(ln.product_id, ln.variant_id) for ln in lines}
    assert len(keys) == len(lines)


@pytest.mark.asyncio
async def test_stock_count_session_pdf_export(db_session) -> None:
    branch = Branch(
        name="PDF Branch",
        code=f"PDF-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch.id)

    detail = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
        responsible_name="Warehouse Lead",
    )
    pdf_bytes, filename = await export_stock_count_pdf_from_session(
        db_session, session_id=detail.id, locale="en"
    )
    assert pdf_bytes.startswith(b"%PDF")
    assert "stock_count" in filename
    assert detail.line_count >= 0


@pytest.mark.asyncio
async def test_stock_count_category_descendants(db_session) -> None:
    branch = Branch(
        name="Tree Branch",
        code=f"TB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    parent = Category(name="Parent", slug=f"p-{uuid.uuid4().hex[:8]}", sort_order=0, is_active=True)
    db_session.add(parent)
    await db_session.flush()
    child = Category(
        name="Child",
        slug=f"c-{uuid.uuid4().hex[:8]}",
        parent_id=parent.id,
        sort_order=0,
        is_active=True,
    )
    db_session.add(child)
    await db_session.flush()

    p_parent = await create_product(
        db_session,
        data={
            "category_id": parent.id,
            "name": "Parent Product",
            "sku": f"pp-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    p_child = await create_product(
        db_session,
        data={
            "category_id": child.id,
            "name": "Child Product",
            "sku": f"cp-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "output_vat_rate": "0",
        },
    )
    from app.models.product_variant import ProductVariant

    for prod in (p_parent, p_child):
        pv = (
            await db_session.execute(
                select(ProductVariant).where(ProductVariant.product_id == prod.id).limit(1)
            )
        ).scalar_one()
        await apply_stock_movement(
            db_session,
            idempotency_key=f"seed-tree:{prod.id}",
            branch_id=branch.id,
            product_id=prod.id,
            qty_delta=2,
            reason="adjustment",
            variant_id=pv.id,
        )

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch.id)

    narrow = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
        category_id=parent.id,
        category_include_descendants=False,
    )
    wide = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
        category_id=parent.id,
        category_include_descendants=True,
    )
    assert wide.line_count >= narrow.line_count
    assert wide.line_count >= 2


@pytest.mark.asyncio
async def test_stock_count_self_service_lists_assigned_draft(db_session) -> None:
    from app.core.errors import NotFoundError

    branch = Branch(
        name="Self Service Branch",
        code=f"SS-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch.id)
    other_id = await _stock_count_assignee(db_session, branch_id=branch.id)

    detail = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
    )

    mine = await list_my_stock_count_sessions(db_session, user_id=assignee_id)
    assert any(s.id == detail.id for s in mine)

    other_list = await list_my_stock_count_sessions(db_session, user_id=other_id)
    assert not any(s.id == detail.id for s in other_list)

    got = await get_my_stock_count_session(db_session, session_id=detail.id, user_id=assignee_id)
    assert got.id == detail.id

    with pytest.raises(NotFoundError, match="stock_count_session_not_found"):
        await get_my_stock_count_session(db_session, session_id=detail.id, user_id=other_id)

    if detail.lines:
        line = detail.lines[0]
        patched = await patch_my_stock_count_lines(
            db_session,
            session_id=detail.id,
            user_id=assignee_id,
            updates=[StockCountLineUpdate(id=line.id, counted_qty=line.system_on_hand)],
        )
        assert patched.lines[0].counted_qty == line.system_on_hand


@pytest.mark.asyncio
async def test_stock_count_assignee_may_be_from_other_branch(db_session) -> None:
    branch_a = Branch(
        name="Count Branch A",
        code=f"CBA-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    branch_b = Branch(
        name="Count Branch B",
        code=f"CBB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add_all([branch_a, branch_b])
    await db_session.flush()

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch_b.id)

    detail = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch_a.id,
        assigned_user_id=assignee_id,
    )
    assert detail.branch_id == branch_a.id
    assert detail.assigned_user_id == assignee_id


@pytest.mark.asyncio
async def test_stock_count_cancel_draft(db_session) -> None:
    from app.services.stock_count_session_service import cancel_stock_count_session

    branch = Branch(
        name="Cancel Branch",
        code=f"CB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    assignee_id = await _stock_count_assignee(db_session, branch_id=branch.id)
    detail = await create_stock_count_session(
        db_session,
        user_id=assignee_id,
        branch_id=branch.id,
        assigned_user_id=assignee_id,
    )
    assert detail.status == "draft"

    await cancel_stock_count_session(db_session, session_id=detail.id)
    await db_session.flush()

    refreshed = await get_my_stock_count_session(
        db_session, session_id=detail.id, user_id=assignee_id
    )
    assert refreshed.status == "cancelled"

    with pytest.raises(ValidationError, match="stock_count_cannot_edit_cancelled"):
        await patch_stock_count_lines(
            db_session,
            session_id=detail.id,
            updates=[],
        )
