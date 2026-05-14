"""Chart of Accounts Admin API (Epic 19.9).

Tree editor for managing the Chart of Accounts with depth validation
and drag-drop support.
"""

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.chart_accounts import AccountType
from app.models.users import User
from app.schemas.chart_accounts import (
    ChartAccountCreate,
    ChartAccountDeleteCheck,
    ChartAccountMoveRequest,
    ChartAccountRead,
    ChartAccountTreeBranchNode,
    ChartAccountTreeNode,
    ChartAccountUpdate,
    CoaTypeSummary,
)
from app.services import audit_service
from app.services.chart_account_service import (
    create_chart_account,
    delete_chart_account,
    get_chart_account,
    get_chart_account_tree,
    get_chart_account_tree_for_branch,
    list_chart_accounts,
    update_chart_account,
    can_delete_account,
)

router = APIRouter()


@router.get(
    "/accounting/chart-accounts/tree",
    response_model=list[ChartAccountTreeNode],
)
async def get_coa_tree_endpoint(
    account_type: AccountType | None = Query(None, description="Filter by account type"),
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "read"),
) -> list[ChartAccountTreeNode]:
    """Get Chart of Accounts as a hierarchical tree.

    Suitable for tree editor UI with drag-drop support.
    """
    tree = await get_chart_account_tree(
        db, account_type=account_type, active_only=active_only
    )
    return [ChartAccountTreeNode(**node) for node in tree]


@router.get(
    "/accounting/chart-accounts/by-branch/{branch_id}",
    response_model=list[ChartAccountTreeBranchNode],
)
async def get_coa_tree_by_branch_endpoint(
    branch_id: int,
    as_of: date | None = Query(
        default=None,
        description="Trial balance as-of date for branch amounts (default: today UTC)",
    ),
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("accounting", "read"),
) -> list[ChartAccountTreeBranchNode]:
    """Chart of accounts tree with per-node balances for one branch (TB through ``as_of``)."""
    eff = as_of or datetime.now(UTC).date()
    tree = await get_chart_account_tree_for_branch(
        db, branch_id=branch_id, as_of=eff, active_only=active_only
    )
    return [ChartAccountTreeBranchNode(**node) for node in tree]


@router.get(
    "/accounting/chart-accounts",
    response_model=list[ChartAccountRead],
)
async def list_coa_endpoint(
    account_type: AccountType | None = Query(None),
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "read"),
) -> list[ChartAccountRead]:
    """List Chart of Accounts entries as a flat list."""
    accounts = await list_chart_accounts(
        db, active_only=active_only, account_type=account_type
    )
    # Calculate depths for each account
    from app.services.chart_account_service import _calculate_depth
    result = []
    for account in accounts:
        depth = await _calculate_depth(db, account.parent_id)
        read = ChartAccountRead.model_validate(account)
        read.depth = depth
        result.append(read)
    return result


@router.post(
    "/accounting/chart-accounts",
    response_model=ChartAccountRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_coa_endpoint(
    body: ChartAccountCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "create"),
) -> ChartAccountRead:
    """Create a new Chart of Accounts entry with depth validation."""
    account = await create_chart_account(
        db,
        code=body.code,
        name=body.name,
        account_type=body.account_type,
        parent_id=body.parent_id,
        is_control=body.is_control,
        active=body.active,
    )
    await audit_service.log(
        session=db,
        action="chart_account.created",
        resource_type="chart_account",
        resource_id=str(account.id),
        user_id=current_user.id,
        request=request,
        details={
            "code": account.code,
            "name": account.name,
            "type": account.account_type.value,
        },
    )
    await db.commit()
    return ChartAccountRead.model_validate(account)


@router.get(
    "/accounting/chart-accounts/{account_id}",
    response_model=ChartAccountRead,
)
async def get_coa_endpoint(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "read"),
) -> ChartAccountRead:
    """Get a single Chart of Accounts entry."""
    from app.core.errors import NotFoundError

    account = await get_chart_account(db, account_id)
    if account is None:
        raise NotFoundError("Chart account not found")
    return ChartAccountRead.model_validate(account)


@router.patch(
    "/accounting/chart-accounts/{account_id}",
    response_model=ChartAccountRead,
)
async def update_coa_endpoint(
    account_id: int,
    body: ChartAccountUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> ChartAccountRead:
    """Update a Chart of Accounts entry with validation."""
    account = await update_chart_account(
        db, account_id=account_id, data=body.model_dump(exclude_unset=True)
    )
    await audit_service.log(
        session=db,
        action="chart_account.updated",
        resource_type="chart_account",
        resource_id=str(account.id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ChartAccountRead.model_validate(account)


@router.post(
    "/accounting/chart-accounts/{account_id}/move",
    response_model=ChartAccountRead,
)
async def move_coa_endpoint(
    account_id: int,
    body: ChartAccountMoveRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> ChartAccountRead:
    """Move a Chart of Accounts entry to a new parent (drag-drop)."""
    account = await update_chart_account(
        db, account_id=account_id, data={"parent_id": body.new_parent_id}
    )
    await audit_service.log(
        session=db,
        action="chart_account.moved",
        resource_type="chart_account",
        resource_id=str(account.id),
        user_id=current_user.id,
        request=request,
        details={"new_parent_id": body.new_parent_id},
    )
    await db.commit()
    return ChartAccountRead.model_validate(account)


@router.get(
    "/accounting/chart-accounts/{account_id}/can-delete",
    response_model=ChartAccountDeleteCheck,
)
async def check_delete_coa_endpoint(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "read"),
) -> ChartAccountDeleteCheck:
    """Check if an account can be deleted before attempting."""
    can_delete, reason = await can_delete_account(db, account_id)
    return ChartAccountDeleteCheck(can_delete=can_delete, reason=reason)


@router.delete(
    "/accounting/chart-accounts/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_coa_endpoint(
    account_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "delete"),
) -> None:
    """Delete a Chart of Accounts entry if allowed."""
    await delete_chart_account(db, account_id=account_id)
    await audit_service.log(
        session=db,
        action="chart_account.deleted",
        resource_type="chart_account",
        resource_id=str(account_id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


@router.get(
    "/accounting/chart-accounts/summary/by-type",
    response_model=list[CoaTypeSummary],
)
async def get_coa_summary_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "read"),
) -> list[CoaTypeSummary]:
    """Get summary of accounts grouped by type."""
    summary = []
    for account_type in AccountType:
        accounts = await list_chart_accounts(
            db, active_only=False, account_type=account_type
        )
        root_count = sum(1 for a in accounts if a.parent_id is None)
        summary.append(
            CoaTypeSummary(
                account_type=account_type,
                count=len(accounts),
                root_count=root_count,
            )
        )
    return summary
