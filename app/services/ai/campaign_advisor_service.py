"""Targeted marketing campaign advisor (Epic 14.3).

Facts: per-customer RFM-style aggregates (recency, frequency, monetary value)
over a lookback window. The service segments customers deterministically into
four buckets (champions, loyal, at_risk, lost) and asks the LLM to turn those
segments into targeted campaigns (channel + offer + CTA).

The fallback yields canned-but-sensible campaigns keyed off the detected
segments so operators still get a useful draft when OpenAI is disabled.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ExternalServiceError
from app.models.sales_invoice import SalesInvoice
from app.schemas.ai_advisory import (
    CampaignSegment,
    TargetedCampaign,
    TargetedCampaignRequest,
    TargetedCampaignResponse,
)
from app.services.ai.llm_client import call_llm_json
from app.utils.money import q2


class _LLMCampaignEnvelope(BaseModel):
    campaigns: list[TargetedCampaign]


_SYSTEM_PROMPT = (
    "You are a retail CRM strategist. Using ONLY the provided segment facts, "
    "propose campaigns as strict JSON matching: "
    '{"campaigns":[{"title":str,"segment":{"segment_code":str,"description":str,'
    '"customer_count":int,"average_order_value":number,"rationale":str},'
    '"channel":"sms|email|push|in_store","offer":str,"call_to_action":str,'
    '"expected_lift_pct":number,"confidence":0.0}]} '
    "Do not invent segment_code values. No text outside JSON."
)


async def _aggregate_customers(
    db: AsyncSession, *, lookback_days: int, min_purchases: int
) -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(days=lookback_days)
    stmt = (
        select(
            SalesInvoice.customer_id,
            func.count().label("purchase_count"),
            func.sum(SalesInvoice.total).label("total_spent"),
            func.max(SalesInvoice.created_at).label("last_purchase_at"),
        )
        .where(SalesInvoice.voided_at.is_(None))
        .where(SalesInvoice.created_at >= cutoff)
        .where(SalesInvoice.customer_id.isnot(None))
        .group_by(SalesInvoice.customer_id)
        .having(func.count() >= min_purchases)
    )
    result = await db.execute(stmt)
    now = datetime.now(UTC)
    rows = []
    for row in result.all():
        last = row.last_purchase_at
        recency_days = (now - last).days if last else 9999
        total = Decimal(row.total_spent or 0)
        count = int(row.purchase_count)
        rows.append(
            {
                "customer_id": int(row.customer_id),
                "purchase_count": count,
                "total_spent": q2(total),
                "average_order_value": q2(total / count) if count else Decimal("0"),
                "recency_days": recency_days,
            }
        )
    return rows


def _segment(rows: list[dict]) -> dict[str, list[dict]]:
    """Split customers into four fixed segments by recency and frequency."""
    buckets: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        r = row["recency_days"]
        f = row["purchase_count"]
        if r <= 14 and f >= 5:
            buckets["champions"].append(row)
        elif r <= 30 and f >= 2:
            buckets["loyal"].append(row)
        elif r >= 60 and f >= 2:
            buckets["at_risk"].append(row)
        elif r >= 120:
            buckets["lost"].append(row)
        else:
            buckets["loyal"].append(row)
    return buckets


_SEGMENT_DESCRIPTIONS = {
    "champions": "Recent high-frequency buyers; treat with VIP recognition.",
    "loyal": "Regular recent buyers; protect the relationship.",
    "at_risk": "Formerly active but have not purchased in 2+ months.",
    "lost": "Silent for 4+ months; aggressive reactivation required.",
}


def _fallback_campaigns(
    buckets: dict[str, list[dict]], max_campaigns: int
) -> list[TargetedCampaign]:
    out: list[TargetedCampaign] = []
    priority = ["at_risk", "lost", "loyal", "champions"]
    for code in priority:
        if len(out) >= max_campaigns:
            break
        rows = buckets.get(code) or []
        if not rows:
            continue
        aov = q2(sum((r["average_order_value"] for r in rows), Decimal("0")) / len(rows))
        segment = CampaignSegment(
            segment_code=code,
            description=_SEGMENT_DESCRIPTIONS[code],
            customer_count=len(rows),
            average_order_value=aov,
            rationale=f"{len(rows)} customers in {code}; AOV {aov}.",
        )
        if code == "champions":
            offer, channel, cta, lift = (
                "Early access to new arrivals + 10% thank-you voucher",
                "email",
                "Unlock your VIP perks",
                4.0,
            )
        elif code == "loyal":
            offer, channel, cta, lift = (
                "Bundle of two frequently-bought items at 10% off",
                "push",
                "See your bundle",
                6.0,
            )
        elif code == "at_risk":
            offer, channel, cta, lift = (
                "Time-limited 15% reactivation coupon",
                "sms",
                "Claim your coupon",
                9.0,
            )
        else:
            offer, channel, cta, lift = (
                "20% win-back voucher with free delivery",
                "sms",
                "Come back and save",
                12.0,
            )
        out.append(
            TargetedCampaign(
                title=f"{code.replace('_', ' ').title()} campaign",
                segment=segment,
                channel=channel,
                offer=offer,
                call_to_action=cta,
                expected_lift_pct=lift,
                confidence=0.7,
            )
        )
    return out


async def generate_targeted_campaigns(
    db: AsyncSession, *, payload: TargetedCampaignRequest
) -> TargetedCampaignResponse:
    rows = await _aggregate_customers(
        db,
        lookback_days=payload.lookback_days,
        min_purchases=payload.min_purchases,
    )
    buckets = _segment(rows)

    facts = {
        "lookback_days": payload.lookback_days,
        "segment_counts": {k: len(v) for k, v in buckets.items()},
        "segment_samples": {
            k: [
                {
                    "customer_id": r["customer_id"],
                    "purchase_count": r["purchase_count"],
                    "average_order_value": r["average_order_value"],
                    "recency_days": r["recency_days"],
                }
                for r in v[:10]
            ]
            for k, v in buckets.items()
        },
        "generated_at": datetime.now(UTC).isoformat(),
    }

    deterministic = _fallback_campaigns(buckets, payload.max_campaigns)
    model_name = "deterministic_fallback"
    campaigns = deterministic

    if settings.OPENAI_API_KEY and deterministic:
        try:
            envelope = await call_llm_json(
                system_prompt=_SYSTEM_PROMPT,
                user_payload={
                    "request": payload.model_dump(),
                    "segments": facts["segment_samples"],
                    "segment_counts": facts["segment_counts"],
                    "deterministic_campaigns": [c.model_dump() for c in deterministic],
                    "instructions": (
                        "Keep the same segments; improve wording, offer framing, and "
                        "channel choice. Do not invent segment_code values outside "
                        "[champions, loyal, at_risk, lost]."
                    ),
                },
                response_model=_LLMCampaignEnvelope,
                max_tokens=1200,
            )
            allowed_codes = {"champions", "loyal", "at_risk", "lost"}
            filtered = [c for c in envelope.campaigns if c.segment.segment_code in allowed_codes]
            if filtered:
                campaigns = filtered[: payload.max_campaigns]
                model_name = settings.OPENAI_MODEL
        except ExternalServiceError:
            campaigns = deterministic

    return TargetedCampaignResponse(
        model=model_name,
        generated_at=datetime.now(UTC),
        facts_used=facts,
        campaigns=campaigns,
    )
