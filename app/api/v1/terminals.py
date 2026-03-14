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
from app.schemas.terminal import TerminalCreate, TerminalCreateResponse, TerminalRead
from app.services import audit_service
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
    q = select(POSTerminal).order_by(POSTerminal.id)
    if branch_id is not None:
        q = q.where(POSTerminal.branch_id == branch_id)
    result = await db.execute(q)
    return [TerminalRead.model_validate(t) for t in result.scalars().all()]


@router.post("/terminals", response_model=TerminalCreateResponse)
async def create_terminal(
    body: TerminalCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("terminals", "create"),
) -> TerminalCreateResponse:
    """Register a new terminal; returns API key once. Requires terminals:create."""
    result = await db.execute(select(Branch).where(Branch.id == body.branch_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    result = await db.execute(select(POSTerminal).where(POSTerminal.terminal_code == body.terminal_code))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Terminal code already exists")

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
