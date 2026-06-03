"""AI advisory API (Epic 14).

All endpoints are POST-with-body because the advisors accept structured
parameters and are side-effect-free (no DB mutations). They require the
``ai_advisory:run`` permission, which maps to the MARKETING_MANAGER and
IT_ADMIN system roles by default (see ``seed_service``).
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_any_permission, require_permission
from app.core.ai_rate_limit import AI_RATE_LIMITS
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.users import User
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
from app.services.ai_call_context import finalize_advisor_run, load_cached_advisor_response

router = APIRouter()


@router.post(
    "/ai/advisory/purchase-reorder",
    response_model=PurchaseReorderResponse,
)
@limiter.limit(AI_RATE_LIMITS["purchase_reorder"])
async def purchase_reorder_endpoint(
    request: Request,
    body: PurchaseReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("ai_advisory", "run"),
) -> PurchaseReorderResponse:
    endpoint = "/api/v1/ai/advisory/purchase-reorder"
    cache_in = body.model_dump(mode="json")
    cached = await load_cached_advisor_response(
        db,
        endpoint=endpoint,
        cache_input=cache_in,
        response_model=PurchaseReorderResponse,
    )
    t0 = time.perf_counter()
    if cached is not None:
        await finalize_advisor_run(
            db,
            endpoint=endpoint,
            user_id=current_user.id,
            cache_input=cache_in,
            model=cached.model,
            response=cached,
            cache_hit=True,
            started_at_perf=t0,
            prompt_tokens=0,
            completion_tokens=0,
        )
        await db.commit()
        return cached

    result, llm_usage = await generate_purchase_reorder(db, payload=body)
    pt = llm_usage.get("prompt_tokens") if llm_usage else None
    ct = llm_usage.get("completion_tokens") if llm_usage else None
    await finalize_advisor_run(
        db,
        endpoint=endpoint,
        user_id=current_user.id,
        cache_input=cache_in,
        model=result.model,
        response=result,
        cache_hit=False,
        started_at_perf=t0,
        prompt_tokens=pt,
        completion_tokens=ct,
    )
    await db.commit()
    return result


@router.post(
    "/ai/advisory/hr-anomalies",
    response_model=HrAnomalyResponse,
)
@limiter.limit(AI_RATE_LIMITS["hr_anomalies"])
async def hr_anomalies_endpoint(
    request: Request,
    body: HrAnomalyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("ai_advisory", "run"),
) -> HrAnomalyResponse:
    endpoint = "/api/v1/ai/advisory/hr-anomalies"
    cache_in = body.model_dump(mode="json")
    cached = await load_cached_advisor_response(
        db,
        endpoint=endpoint,
        cache_input=cache_in,
        response_model=HrAnomalyResponse,
    )
    t0 = time.perf_counter()
    if cached is not None:
        await finalize_advisor_run(
            db,
            endpoint=endpoint,
            user_id=current_user.id,
            cache_input=cache_in,
            model=cached.model,
            response=cached,
            cache_hit=True,
            started_at_perf=t0,
            prompt_tokens=0,
            completion_tokens=0,
        )
        await db.commit()
        return cached

    result, llm_usage = await detect_hr_anomalies(db, payload=body)
    pt = llm_usage.get("prompt_tokens") if llm_usage else None
    ct = llm_usage.get("completion_tokens") if llm_usage else None
    await finalize_advisor_run(
        db,
        endpoint=endpoint,
        user_id=current_user.id,
        cache_input=cache_in,
        model=result.model,
        response=result,
        cache_hit=False,
        started_at_perf=t0,
        prompt_tokens=pt,
        completion_tokens=ct,
    )
    await db.commit()
    return result


@router.post(
    "/ai/advisory/campaigns",
    response_model=TargetedCampaignResponse,
)
@limiter.limit(AI_RATE_LIMITS["campaigns"])
async def campaigns_endpoint(
    request: Request,
    body: TargetedCampaignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("ai_advisory", "run"),
) -> TargetedCampaignResponse:
    endpoint = "/api/v1/ai/advisory/campaigns"
    cache_in = body.model_dump(mode="json")
    cached = await load_cached_advisor_response(
        db,
        endpoint=endpoint,
        cache_input=cache_in,
        response_model=TargetedCampaignResponse,
    )
    t0 = time.perf_counter()
    if cached is not None:
        await finalize_advisor_run(
            db,
            endpoint=endpoint,
            user_id=current_user.id,
            cache_input=cache_in,
            model=cached.model,
            response=cached,
            cache_hit=True,
            started_at_perf=t0,
            prompt_tokens=0,
            completion_tokens=0,
        )
        await db.commit()
        return cached

    result, llm_usage = await generate_targeted_campaigns(db, payload=body)
    pt = llm_usage.get("prompt_tokens") if llm_usage else None
    ct = llm_usage.get("completion_tokens") if llm_usage else None
    await finalize_advisor_run(
        db,
        endpoint=endpoint,
        user_id=current_user.id,
        cache_input=cache_in,
        model=result.model,
        response=result,
        cache_hit=False,
        started_at_perf=t0,
        prompt_tokens=pt,
        completion_tokens=ct,
    )
    await db.commit()
    return result


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
@limiter.limit(AI_RATE_LIMITS["invoice_match"])
async def invoice_match_endpoint(
    request: Request,
    body: InvoiceMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(
        ("ai_advisory", "run"),
        ("invoice_scans", "validate"),
    ),
) -> InvoiceMatchResponse:
    endpoint = "/api/v1/ai/advisory/invoice-match"
    cache_in = body.model_dump(mode="json")
    cached = await load_cached_advisor_response(
        db,
        endpoint=endpoint,
        cache_input=cache_in,
        response_model=InvoiceMatchResponse,
    )
    t0 = time.perf_counter()
    if cached is not None:
        await finalize_advisor_run(
            db,
            endpoint=endpoint,
            user_id=current_user.id,
            cache_input=cache_in,
            model=cached.model,
            response=cached,
            cache_hit=True,
            started_at_perf=t0,
            prompt_tokens=0,
            completion_tokens=0,
        )
        await db.commit()
        return cached

    result, llm_usage = await match_invoice_scan(db, payload=body)
    pt = llm_usage.get("prompt_tokens") if llm_usage else None
    ct = llm_usage.get("completion_tokens") if llm_usage else None
    await finalize_advisor_run(
        db,
        endpoint=endpoint,
        user_id=current_user.id,
        cache_input=cache_in,
        model=result.model,
        response=result,
        cache_hit=False,
        started_at_perf=t0,
        prompt_tokens=pt,
        completion_tokens=ct,
    )
    await db.commit()
    return result
