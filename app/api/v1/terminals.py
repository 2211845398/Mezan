"""POS terminal API: register and authorize (RBAC-protected)."""

from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.branch import Branch
from app.models.pos_terminal import POSTerminal
from app.models.users import User
from app.schemas.terminal import (
    TerminalCreate,
    TerminalCreateResponse,
    TerminalRead,
    TerminalUpdate,
)
from app.services import audit_service
from app.services.branch_accounting_service import ensure_terminal_cash_account
from app.services.branch_scope import require_branch_open_for_operations
from app.utils.security import hash_token

router = APIRouter()


@router.get("/terminals", response_model=list[TerminalRead])
async def list_terminals(
    db: AsyncSession = Depends(get_db),
    branch_id: int | None = Query(None),
    _: None = Depends(get_current_user),
    __: None = require_permission("terminals", "read"),
) -> list[TerminalRead]:
    """List terminals, optionally by branch. Requires terminals:read."""
    q = (
        select(POSTerminal, Branch.name.label("branch_name"))
        .join(Branch, Branch.id == POSTerminal.branch_id)
        .order_by(POSTerminal.id)
    )
    if branch_id is not None:
        q = q.where(POSTerminal.branch_id == branch_id)
    result = await db.execute(q)
    rows: list[TerminalRead] = []
    for terminal, branch_name in result.all():
        payload = TerminalRead.model_validate(terminal).model_dump()
        payload["branch_name"] = branch_name
        rows.append(TerminalRead.model_validate(payload))
    return rows


@router.post("/terminals", response_model=TerminalCreateResponse)
async def create_terminal(
    body: TerminalCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("terminals", "create"),
) -> TerminalCreateResponse:
    """Register a new terminal; returns API key once. Requires terminals:create."""
    await require_branch_open_for_operations(db, body.branch_id)
    result = await db.execute(
        select(POSTerminal).where(POSTerminal.terminal_code == body.terminal_code)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Terminal code already exists"
        )

    api_key = f"pos_{token_urlsafe(32)}"
    api_key_hash = hash_token(api_key)

    terminal = POSTerminal(
        branch_id=body.branch_id,
        name=body.name,
        terminal_code=body.terminal_code,
        api_key_hash=api_key_hash,
        is_authorized=False,
    )
    db.add(terminal)
    await db.flush()
    await ensure_terminal_cash_account(db, terminal.id)
    await db.commit()
    await db.refresh(terminal)
    await audit_service.log(
        session=db,
        action="terminal.created",
        resource_type="terminal",
        resource_id=str(terminal.id),
        new_value=TerminalRead.model_validate(terminal).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return TerminalCreateResponse(
        id=terminal.id,
        branch_id=terminal.branch_id,
        name=terminal.name,
        terminal_code=terminal.terminal_code,
        is_authorized=terminal.is_authorized,
        api_key=api_key,
    )


@router.patch("/terminals/{terminal_id}", response_model=TerminalRead)
async def update_terminal(
    terminal_id: int,
    body: TerminalUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("terminals", "update"),
) -> TerminalRead:
    """Update terminal name and/or branch. Requires terminals:update."""
    result = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = result.scalar_one_or_none()
    if not terminal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Terminal not found")
    if body.branch_id is not None:
        await require_branch_open_for_operations(db, body.branch_id)
    old_value = TerminalRead.model_validate(terminal).model_dump()
    if body.name is not None:
        terminal.name = body.name
    if body.branch_id is not None:
        terminal.branch_id = body.branch_id
    await db.commit()
    await db.refresh(terminal)
    await audit_service.log(
        session=db,
        action="terminal.updated",
        resource_type="pos_terminal",
        resource_id=str(terminal.id),
        old_value=old_value,
        new_value=TerminalRead.model_validate(terminal).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return TerminalRead.model_validate(terminal)


@router.patch("/terminals/{terminal_id}/authorize")
async def authorize_terminal(
    terminal_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("terminals", "authorize"),
) -> TerminalRead:
    """Set terminal as authorized to process transactions. Requires terminals:authorize."""
    result = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = result.scalar_one_or_none()
    if not terminal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Terminal not found")
    old_value = TerminalRead.model_validate(terminal).model_dump()
    terminal.is_authorized = True
    await db.commit()
    await db.refresh(terminal)
    await audit_service.log(
        session=db,
        action="terminal.authorized",
        resource_type="terminal",
        resource_id=str(terminal.id),
        old_value=old_value,
        new_value=TerminalRead.model_validate(terminal).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return TerminalRead.model_validate(terminal)


@router.patch("/terminals/{terminal_id}/deauthorize")
async def deauthorize_terminal(
    terminal_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("terminals", "update"),
) -> TerminalRead:
    """Revoke terminal authorization. Requires terminals:update."""
    result = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = result.scalar_one_or_none()
    if not terminal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Terminal not found")
    old_value = TerminalRead.model_validate(terminal).model_dump()
    terminal.is_authorized = False
    await db.commit()
    await db.refresh(terminal)
    await audit_service.log(
        session=db,
        action="terminal.deauthorized",
        resource_type="terminal",
        resource_id=str(terminal.id),
        old_value=old_value,
        new_value=TerminalRead.model_validate(terminal).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return TerminalRead.model_validate(terminal)
