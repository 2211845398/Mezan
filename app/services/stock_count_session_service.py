"""Stock count sessions: issue, fill, and post variances."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import not_found_error, validation_error
from app.models.branch import Branch
from app.models.role import Role
from app.models.stock_count_session import StockCountLine, StockCountSession
from app.models.user_role import UserRole
from app.models.users import User
from app.schemas.stock_count import (
    StockCountLineRead,
    StockCountLineUpdate,
    StockCountPostResult,
    StockCountSessionDetailRead,
    StockCountSessionRead,
)
from app.services.catalog_service import _category_descendant_ids
from app.services.inventory_human_movement_service import apply_human_inventory_movement
from app.services.inventory_reporting_service import list_stock_on_hand
from app.utils.person_name import person_name_sql_expr

_STOCK_COUNT_ASSIGNEE_ROLES = frozenset({"CASHIER", "FLOOR_STAFF", "WAREHOUSE_MANAGER"})


async def _user_role_codes(db: AsyncSession, user_id: int) -> set[str]:
    res = await db.execute(
        select(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    return {str(c).strip().upper() for c, in res.all() if c}


async def validate_stock_count_assignee(
    db: AsyncSession,
    *,
    assigned_user_id: int,
) -> str:
    user = await db.get(User, user_id := assigned_user_id)
    if user is None or (user.status or "").lower() != "active":
        validation_error(
            "stock_count_assignee_inactive",
            "Assigned user must be active",
            assigned_user_id=assigned_user_id,
        )
    codes = await _user_role_codes(db, user_id)
    if not codes & _STOCK_COUNT_ASSIGNEE_ROLES:
        validation_error(
            "stock_count_assignee_invalid_role",
            "Assigned user must be cashier, sales staff, or warehouses custodian",
            assigned_user_id=assigned_user_id,
            role_codes=sorted(codes),
        )
    res = await db.execute(
        select(
            person_name_sql_expr(User.first_name, User.father_name, User.family_name),
            User.email,
        ).where(User.id == user_id)
    )
    row = res.one()
    name = (str(row[0]).strip() if row[0] else "") or (str(row[1]).strip() if row[1] else "")
    if not name:
        validation_error(
            "stock_count_assignee_name_missing",
            "Assigned user has no display name",
            assigned_user_id=assigned_user_id,
        )
    return name


async def _assert_session_assignee(
    db: AsyncSession,
    *,
    session_id: int,
    user_id: int,
) -> StockCountSession:
    session = await db.get(StockCountSession, session_id)
    if session is None:
        not_found_error(
            "stock_count_session_not_found",
            "Stock count session not found",
            session_id=session_id,
        )
    if session.assigned_user_id != user_id:
        not_found_error(
            "stock_count_session_not_found",
            "Stock count session not found",
            session_id=session_id,
        )
    return session


async def list_my_stock_count_sessions(
    db: AsyncSession,
    *,
    user_id: int,
    limit: int = 100,
) -> list[StockCountSessionRead]:
    stmt = (
        select(StockCountSession, Branch.name, func.count(StockCountLine.id))
        .join(Branch, Branch.id == StockCountSession.branch_id)
        .outerjoin(StockCountLine, StockCountLine.session_id == StockCountSession.id)
        .where(
            StockCountSession.assigned_user_id == user_id,
            StockCountSession.status.in_(("draft", "in_progress")),
        )
        .group_by(StockCountSession.id, Branch.name)
        .order_by(StockCountSession.id.desc())
        .limit(min(max(limit, 1), 500))
    )
    res = await db.execute(stmt)
    out: list[StockCountSessionRead] = []
    for sess, branch_name, line_count in res.all():
        out.append(
            StockCountSessionRead(
                id=sess.id,
                branch_id=sess.branch_id,
                branch_name=str(branch_name),
                version_no=sess.version_no,
                status=sess.status,
                category_id=sess.category_id,
                responsible_name=sess.responsible_name,
                assigned_user_id=sess.assigned_user_id,
                created_by=sess.created_by,
                created_at=sess.created_at,
                posted_at=sess.posted_at,
                line_count=int(line_count or 0),
            )
        )
    return out


async def _stock_count_category_filter(
    db: AsyncSession,
    *,
    category_id: int | None,
    category_include_descendants: bool,
) -> tuple[int | None, set[int] | None]:
    if category_id is None:
        return None, None
    if category_include_descendants:
        return None, await _category_descendant_ids(db, category_id)
    return category_id, None


def _line_variance(line: StockCountLine) -> int | None:
    if line.counted_qty is None:
        return None
    return int(line.counted_qty) - int(line.system_on_hand)


def _line_to_read(line: StockCountLine) -> StockCountLineRead:
    return StockCountLineRead(
        id=line.id,
        product_id=line.product_id,
        variant_id=line.variant_id,
        product_name=line.product_name,
        variant_name=line.variant_name,
        reference_code=line.reference_code,
        system_on_hand=line.system_on_hand,
        system_reserved=line.system_reserved,
        system_damaged=line.system_damaged,
        counted_qty=line.counted_qty,
        damaged_counted=line.damaged_counted,
        notes=line.notes,
        variance=_line_variance(line),
    )


async def _next_version_no(db: AsyncSession, *, branch_id: int) -> int:
    res = await db.execute(
        select(func.coalesce(func.max(StockCountSession.version_no), 0)).where(
            StockCountSession.branch_id == branch_id
        )
    )
    return int(res.scalar() or 0) + 1


async def create_stock_count_session(
    db: AsyncSession,
    *,
    user_id: int,
    branch_id: int,
    category_id: int | None = None,
    category_include_descendants: bool = False,
    product_ids: list[int] | None = None,
    responsible_name: str = "",
    assigned_user_id: int | None = None,
) -> StockCountSessionDetailRead:
    if assigned_user_id is None:
        validation_error(
            "stock_count_assignee_required",
            "assigned_user_id is required",
        )
    assignee_name = await validate_stock_count_assignee(
        db,
        assigned_user_id=assigned_user_id,
    )
    version_no = await _next_version_no(db, branch_id=branch_id)
    product_ids_json = json.dumps(product_ids) if product_ids else None
    display_name = (responsible_name or "").strip() or assignee_name

    session = StockCountSession(
        branch_id=branch_id,
        version_no=version_no,
        status="draft",
        category_id=category_id,
        product_ids_json=product_ids_json,
        responsible_name=display_name,
        assigned_user_id=assigned_user_id,
        created_by=user_id,
    )
    db.add(session)
    await db.flush()

    cat_id, cat_ids = await _stock_count_category_filter(
        db,
        category_id=category_id,
        category_include_descendants=category_include_descendants,
    )
    stock_rows = await list_stock_on_hand(
        db,
        branch_id=branch_id,
        category_id=cat_id,
        category_ids=cat_ids,
        limit=5000,
        offset=0,
    )
    if product_ids:
        pid_set = set(product_ids)
        stock_rows = [r for r in stock_rows if r.product_id in pid_set]

    for r in stock_rows:
        db.add(
            StockCountLine(
                session_id=session.id,
                product_id=r.product_id,
                variant_id=r.variant_id,
                product_name=r.product_name,
                variant_name=r.variant_name or r.variant_attributes,
                reference_code=(r.reference_code or "").strip(),
                system_on_hand=int(r.on_hand),
                system_reserved=int(r.reserved),
                system_damaged=int(r.damaged),
            )
        )
    await db.flush()
    return await get_stock_count_session(db, session_id=session.id)


async def list_stock_count_sessions(
    db: AsyncSession,
    *,
    branch_id: int | None = None,
    limit: int = 100,
) -> list[StockCountSessionRead]:
    stmt = (
        select(StockCountSession, Branch.name, func.count(StockCountLine.id))
        .join(Branch, Branch.id == StockCountSession.branch_id)
        .outerjoin(StockCountLine, StockCountLine.session_id == StockCountSession.id)
        .group_by(StockCountSession.id, Branch.name)
        .order_by(StockCountSession.id.desc())
        .limit(min(max(limit, 1), 500))
    )
    if branch_id is not None:
        stmt = stmt.where(StockCountSession.branch_id == branch_id)

    res = await db.execute(stmt)
    out: list[StockCountSessionRead] = []
    for sess, branch_name, line_count in res.all():
        out.append(
            StockCountSessionRead(
                id=sess.id,
                branch_id=sess.branch_id,
                branch_name=str(branch_name),
                version_no=sess.version_no,
                status=sess.status,
                category_id=sess.category_id,
                responsible_name=sess.responsible_name,
                assigned_user_id=sess.assigned_user_id,
                created_by=sess.created_by,
                created_at=sess.created_at,
                posted_at=sess.posted_at,
                line_count=int(line_count or 0),
            )
        )
    return out


async def get_stock_count_session(
    db: AsyncSession,
    *,
    session_id: int,
) -> StockCountSessionDetailRead:
    res = await db.execute(
        select(StockCountSession)
        .where(StockCountSession.id == session_id)
        .options(selectinload(StockCountSession.lines))
    )
    session = res.scalar_one_or_none()
    if session is None:
        not_found_error(
            "stock_count_session_not_found",
            "Stock count session not found",
            session_id=session_id,
        )

    branch_res = await db.execute(select(Branch.name).where(Branch.id == session.branch_id))
    branch_name = str(branch_res.scalar_one_or_none() or session.branch_id)

    lines = sorted(session.lines, key=lambda ln: (ln.product_name, ln.variant_name, ln.id))
    return StockCountSessionDetailRead(
        id=session.id,
        branch_id=session.branch_id,
        branch_name=branch_name,
        version_no=session.version_no,
        status=session.status,
        category_id=session.category_id,
        responsible_name=session.responsible_name,
        assigned_user_id=session.assigned_user_id,
        created_by=session.created_by,
        created_at=session.created_at,
        posted_at=session.posted_at,
        line_count=len(lines),
        lines=[_line_to_read(ln) for ln in lines],
    )


async def patch_stock_count_lines(
    db: AsyncSession,
    *,
    session_id: int,
    updates: list[StockCountLineUpdate],
) -> StockCountSessionDetailRead:
    session = await db.get(StockCountSession, session_id)
    if session is None:
        not_found_error(
            "stock_count_session_not_found",
            "Stock count session not found",
            session_id=session_id,
        )
    if session.status == "posted":
        validation_error(
            "stock_count_cannot_edit_posted", "Cannot edit a posted stock count session"
        )
    if session.status == "cancelled":
        validation_error(
            "stock_count_cannot_edit_cancelled", "Cannot edit a cancelled stock count session"
        )

    if session.status == "draft":
        session.status = "in_progress"

    by_id = {u.id: u for u in updates}
    res = await db.execute(select(StockCountLine).where(StockCountLine.session_id == session_id))
    for line in res.scalars().all():
        upd = by_id.get(line.id)
        if upd is None:
            continue
        if upd.counted_qty is not None:
            line.counted_qty = upd.counted_qty
        if upd.damaged_counted is not None:
            line.damaged_counted = upd.damaged_counted
        if upd.notes is not None:
            line.notes = upd.notes.strip() or None

    await db.flush()
    return await get_stock_count_session(db, session_id=session_id)


async def get_my_stock_count_session(
    db: AsyncSession,
    *,
    session_id: int,
    user_id: int,
) -> StockCountSessionDetailRead:
    await _assert_session_assignee(db, session_id=session_id, user_id=user_id)
    return await get_stock_count_session(db, session_id=session_id)


async def patch_my_stock_count_lines(
    db: AsyncSession,
    *,
    session_id: int,
    user_id: int,
    updates: list[StockCountLineUpdate],
) -> StockCountSessionDetailRead:
    await _assert_session_assignee(db, session_id=session_id, user_id=user_id)
    return await patch_stock_count_lines(db, session_id=session_id, updates=updates)


_CANCELLABLE_STOCK_COUNT_STATUSES = frozenset({"draft", "in_progress"})


async def cancel_stock_count_session(
    db: AsyncSession,
    *,
    session_id: int,
) -> None:
    session = await db.get(StockCountSession, session_id)
    if session is None:
        not_found_error(
            "stock_count_session_not_found",
            "Stock count session not found",
            session_id=session_id,
        )
    if session.status == "posted":
        validation_error(
            "stock_count_cannot_cancel_posted",
            "Cannot cancel a posted stock count session",
            session_id=session_id,
        )
    if session.status == "cancelled":
        validation_error(
            "stock_count_already_cancelled",
            "Stock count session is already cancelled",
            session_id=session_id,
        )
    if session.status not in _CANCELLABLE_STOCK_COUNT_STATUSES:
        validation_error(
            "stock_count_cannot_cancel",
            "Stock count session cannot be cancelled in its current state",
            session_id=session_id,
            status=session.status,
        )
    session.status = "cancelled"
    await db.flush()


async def post_stock_count_session(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: int,
) -> StockCountPostResult:
    session = await db.get(StockCountSession, session_id)
    if session is None:
        not_found_error(
            "stock_count_session_not_found",
            "Stock count session not found",
            session_id=session_id,
        )
    if session.status == "posted":
        validation_error("stock_count_already_posted", "Stock count session is already posted")
    if session.status == "cancelled":
        validation_error(
            "stock_count_cancelled_cannot_post", "Cannot post a cancelled stock count session"
        )

    res = await db.execute(select(StockCountLine).where(StockCountLine.session_id == session_id))
    lines = list(res.scalars().all())
    incomplete = [line.id for line in lines if line.counted_qty is None]
    if incomplete:
        validation_error(
            "stock_count_incomplete_lines",
            "All stock count lines must have counted quantity before posting",
            incomplete_line_ids=incomplete,
        )
    posted = 0
    for line in lines:
        variance = int(line.counted_qty) - int(line.system_on_hand)
        if variance == 0:
            continue
        await apply_human_inventory_movement(
            db,
            user_id=user_id,
            idempotency_key=f"stock_count:{session_id}:line:{line.id}",
            branch_id=session.branch_id,
            product_id=line.product_id,
            variant_id=line.variant_id,
            transaction_type="count_adjust",
            qty_signed=variance,
            reason="stock_count",
            notes=f"Stock count v{session.version_no} session {session_id}",
        )
        posted += 1

    session.status = "posted"
    session.posted_at = datetime.now(UTC)
    await db.flush()
    return StockCountPostResult(session_id=session_id, movements_posted=posted)
