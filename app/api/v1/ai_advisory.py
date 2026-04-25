"""AI advisory API (Epic 14).

All endpoints are POST-with-body because the advisors accept structured
parameters and are side-effect-free (no DB mutations). They require the
``ai_advisory:run`` permission, which maps to the MARKETING_MANAGER and
IT_ADMIN system roles by default (see ``seed_service``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_any_permission, require_permission
from app.db.database import get_db
from app.schemas.ai_advisory import (
    CampaignSegmentExportRequest,
    HrAnomalyRequest,
    HrAnomalyResponse,
    InvoiceMatchRequest,
    InvoiceMatchResponse,
    PurchaseReorderRequest,
    PurchaseReorderResponse,
    TargetedCampaignRequest,
    TargetedCampaignResponse,
)
from app.services.ai.campaign_advisor_service import (
    export_segment_customer_ids_csv,
    generate_targeted_campaigns,
)
from app.services.ai.hr_anomaly_service import detect_hr_anomalies
from app.services.ai.invoice_matcher_service import match_invoice_scan
from app.services.ai.purchase_reorder_service import generate_purchase_reorder

router = APIRouter()


@router.post(
    "/ai/advisory/purchase-reorder",
    response_model=PurchaseReorderResponse,
)
async def purchase_reorder_endpoint(
    body: PurchaseReorderRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("ai_advisory", "run"),
) -> PurchaseReorderResponse:
    return await generate_purchase_reorder(db, payload=body)


@router.post(
    "/ai/advisory/hr-anomalies",
    response_model=HrAnomalyResponse,
)
async def hr_anomalies_endpoint(
    body: HrAnomalyRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("ai_advisory", "run"),
) -> HrAnomalyResponse:
    return await detect_hr_anomalies(db, payload=body)


@router.post(
    "/ai/advisory/campaigns",
    response_model=TargetedCampaignResponse,
)
async def campaigns_endpoint(
    body: TargetedCampaignRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("ai_advisory", "run"),
) -> TargetedCampaignResponse:
    return await generate_targeted_campaigns(db, payload=body)


@router.post(
    "/ai/advisory/campaigns/segment-export",
    response_class=PlainTextResponse,
)
async def campaign_segment_export_endpoint(
    body: CampaignSegmentExportRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("ai_advisory", "run"),
) -> PlainTextResponse:
    csv_text = await export_segment_customer_ids_csv(
        db,
        segment_code=body.segment_code,
        lookback_days=body.lookback_days,
        min_purchases=body.min_purchases,
    )
    return PlainTextResponse(
        csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="segment_customers.csv"'},
    )


@router.post(
    "/ai/advisory/invoice-match",
    response_model=InvoiceMatchResponse,
)
async def invoice_match_endpoint(
    body: InvoiceMatchRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_any_permission(
        ("ai_advisory", "run"),
        ("invoice_scans", "validate"),
    ),
) -> InvoiceMatchResponse:
    return await match_invoice_scan(db, payload=body)
