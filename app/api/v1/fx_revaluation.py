"""FX Revaluation API (Epic 20.2)."""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.fx_revaluation import (
    FxRevaluationRunRequest,
    FxRevaluationRunResponse,
    FxRevaluationSummaryRequest,
    FxRevaluationSummaryResponse,
)
from app.services import audit_service
from app.services.fx_revaluation_service import run_fx_revaluation

router = APIRouter()


@router.post(
    "/accounting/fx-revaluation/run",
    response_model=FxRevaluationRunResponse,
    status_code=status.HTTP_201_CREATED,
)
async def run_fx_revaluation_endpoint(
    body: FxRevaluationRunRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "update"),
) -> FxRevaluationRunResponse:
    """Run FX revaluation for open AR/AP at period close.

    Creates journal entries for FX gains/losses based on current exchange rates.
    Idempotent: safe to run multiple times for the same date.
    """
    entries = await run_fx_revaluation(
        db,
        revaluation_date=body.revaluation_date,
        branch_id=body.branch_id,
        created_by_user_id=current_user.id,
    )

    await audit_service.log(
        session=db,
        action="fx_revaluation.run",
        resource_type="fx_revaluation",
        resource_id=str(body.revaluation_date),
        user_id=current_user.id,
        request=request,
        details={
            "branch_id": body.branch_id,
            "entries_created": len(entries),
        },
    )
    await db.commit()

    return FxRevaluationRunResponse(
        revaluation_date=body.revaluation_date,
        branch_id=body.branch_id,
        entries_created=len(entries),
        message=f"Created {len(entries)} FX revaluation entries",
    )


@router.post(
    "/accounting/fx-revaluation/preview",
    response_model=FxRevaluationSummaryResponse,
)
async def preview_fx_revaluation_endpoint(
    body: FxRevaluationSummaryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("accounting", "read"),
) -> FxRevaluationSummaryResponse:
    """Preview estimated FX gains/losses without creating journal entries."""
    # This would call a preview service method
    # For now return a placeholder
    return FxRevaluationSummaryResponse(
        as_of_date=body.as_of_date,
        branch_id=body.branch_id,
        currencies=[],
        total_estimated_gain_loss=0,
    )
