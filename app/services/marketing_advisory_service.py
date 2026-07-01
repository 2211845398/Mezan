"""Deterministic-facts AI advisory service for marketing decisions."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import settings
from app.core.errors import ExternalServiceError
from app.models.product import Product
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.schemas.marketing_advisory import (
    MarketingAdvisoryRequest,
    MarketingAdvisoryResponse,
    MarketingSuggestion,
)
from app.services.ai.llm_client import call_llm_json
from app.services.analytics_service import (
    get_customer_purchase_aggregates,
    get_inventory_alerts,
    get_promotion_performance,
    get_sales_period_summary,
    get_slow_moving_products,
    get_top_selling_products,
)
from app.utils.date_sql import calendar_day_range


class _LLMAdvisoryEnvelope(BaseModel):
    suggestions: list[MarketingSuggestion]


_SYSTEM_PROMPT = (
    "You are a retail marketing advisor for a Middle East retailer. "
    "Use ONLY the provided facts JSON. Respond in Arabic for title, rationale, and action_items. "
    "Return strict JSON matching: "
    '{"suggestions":[{"title":"...","rationale":"...","action_items":["..."],'
    '"priority":"high|medium|low","confidence":0.0}]} '
    "Each suggestion object must contain only those six keys. "
    "Do not invent product names, counts, or revenue figures not present in facts. "
    "No text outside JSON."
)


async def _get_frequent_cobought_pairs(
    db: AsyncSession,
    *,
    limit: int = 10,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    branch_id: int | None = None,
) -> list[dict[str, Any]]:
    left = SalesInvoiceLine.__table__.alias("left_line")
    right = SalesInvoiceLine.__table__.alias("right_line")
    inv = aliased(SalesInvoice)
    p1 = Product.__table__.alias("p1")
    p2 = Product.__table__.alias("p2")

    stmt = (
        select(
            left.c.product_id.label("product_a_id"),
            p1.c.name.label("product_a_name"),
            right.c.product_id.label("product_b_id"),
            p2.c.name.label("product_b_name"),
            func.count().label("pair_count"),
        )
        .select_from(left)
        .join(inv, inv.id == left.c.sales_invoice_id)
        .where(inv.voided_at.is_(None))
        .join(
            right,
            (left.c.sales_invoice_id == right.c.sales_invoice_id)
            & (left.c.product_id < right.c.product_id),
        )
        .join(p1, p1.c.id == left.c.product_id)
        .join(p2, p2.c.id == right.c.product_id)
        .group_by(left.c.product_id, p1.c.name, right.c.product_id, p2.c.name)
        .order_by(func.count().desc())
        .limit(limit)
    )
    if period_start is not None or period_end is not None:
        stmt = stmt.where(
            *calendar_day_range(
                inv.created_at,
                start=period_start,
                end=period_end,
            )
        )
    if branch_id is not None:
        stmt = stmt.where(inv.branch_id == branch_id)

    result = await db.execute(stmt)
    return [
        {
            "product_a_id": row.product_a_id,
            "product_a_name": row.product_a_name,
            "product_b_id": row.product_b_id,
            "product_b_name": row.product_b_name,
            "pair_count": int(row.pair_count),
        }
        for row in result.all()
    ]


def _build_fallback_suggestions(
    facts: dict[str, Any], max_suggestions: int
) -> list[MarketingSuggestion]:
    """Rule-based suggestions in Arabic; product names stay as stored (often English)."""
    suggestions: list[MarketingSuggestion] = []
    expiring = facts.get("expiring_inventory") or []
    if expiring:
        top = expiring[0]
        pname = str(top.get("product_name") or "")
        suggestions.append(
            MarketingSuggestion(
                title=f"ترويج لمخزون قارب الانتهاء: {pname}",
                rationale=(
                    "يُنبه المخزون على صلاحية قريبة مع وجود كمية متوفرة؛ "
                    "يُفضّل تسريع البيع قبل الضياع."
                ),
                action_items=[
                    "عرض خصم لفترة محدودة على الأصناف قاربة الانتهاء.",
                    "وضع المنتج في أماكن عرض أو قنوات واضحة للزبائن.",
                ],
                priority="high",
                confidence=0.82,
            )
        )

    slow_items = facts.get("slow_moving_products") or []
    if slow_items:
        top = slow_items[0]
        pname = str(top.get("product_name") or "")
        suggestions.append(
            MarketingSuggestion(
                title=f"تجميع مع منتج بطيء الحركة: {pname}",
                rationale=(
                    "هذا المنتج ذو دوران منخفض؛ يمكن ربطه بأفضل المبيعات "
                    "أو تغليفه في عرض ترويجي قصير لرفع الاهتمام."
                ),
                action_items=[
                    "تجميعه مع أحد الأصناف الأكثر مبيعاً للبيع المشترك.",
                    "تجربة عرض ترويجي قصير مع مراقبة معدل التحويل.",
                ],
                priority="medium",
                confidence=0.75,
            )
        )

    top_products = facts.get("top_selling_products") or []
    if top_products:
        top = top_products[0]
        pname = str(top.get("product_name") or "")
        suggestions.append(
            MarketingSuggestion(
                title=f"بيع إضافي حول الأكثر مبيعاً: {pname}",
                rationale=(
                    "الأصناف الأكثر مبيعاً تجذب الزيارات؛ الربط بتوصيات مكملة "
                    "أو عروض جانبية يرفع متوسط قيمة السلة."
                ),
                action_items=[
                    "إطلاق توصيات بمنتجات مكملة عند السلة أو الصفحة.",
                    "زيادة مساحة العرض أو ميزانية الإبراز لهذه الفئة قليلاً.",
                ],
                priority="medium",
                confidence=0.73,
            )
        )

    co_bought = facts.get("co_bought_pairs") or []
    if co_bought:
        pair = co_bought[0]
        a = str(pair.get("product_a_name") or "")
        b = str(pair.get("product_b_name") or "")
        suggestions.append(
            MarketingSuggestion(
                title=f"عرض تجميعي: {a} + {b}",
                rationale=(
                    "يظهر النمط أن الزبائن يشترون هذين المنتجين معاً بشكل متكرر؛ "
                    "مناسب لعرض «كمبو» أو خصم على الشراء المزدوج."
                ),
                action_items=[
                    "إنشاء عرض تجميعي للزوج الأكثر شراءً معاً.",
                    "مقارنة تسعير التجميعة مقابل خصومات منفصلة (اختبار بسيط).",
                ],
                priority="medium",
                confidence=0.78,
            )
        )

    customer_agg = facts.get("customer_aggregates") or {}
    repeat_rate = customer_agg.get("repeat_rate_pct")
    if (
        isinstance(repeat_rate, (int, float))
        and repeat_rate < 30
        and customer_agg.get("active_customers", 0) > 0
    ):
        suggestions.append(
            MarketingSuggestion(
                title="حملة ولاء لرفع تكرار الشراء",
                rationale=(
                    f"نسبة العملاء المتكررين {repeat_rate}% فقط خلال الفترة؛ "
                    "فرصة لقسائم إعادة زيارة أو نقاط ولاء."
                ),
                action_items=[
                    "إرسال قسيمة خصم بعد أول شراء خلال 14 يوماً.",
                    "تجربة عرض «اشترِ مرتين واحصل على خصم» للعملاء الجدد.",
                ],
                priority="medium",
                confidence=0.7,
            )
        )

    return suggestions[:max_suggestions]


async def generate_marketing_advisory(
    db: AsyncSession, *, payload: MarketingAdvisoryRequest
) -> tuple[MarketingAdvisoryResponse, dict[str, int] | None]:
    period_end = datetime.now(UTC)
    period_start = period_end - timedelta(days=payload.lookback_days)

    top_products = await get_top_selling_products(
        db,
        limit=payload.top_products_limit,
        period_start=period_start,
        period_end=period_end,
        branch_id=payload.branch_id,
    )
    slow_products = await get_slow_moving_products(
        db,
        threshold_qty=5,
        limit=payload.top_products_limit,
        period_start=period_start,
        period_end=period_end,
        branch_id=payload.branch_id,
    )
    expiring_inventory = await get_inventory_alerts(db, days_ahead=payload.days_ahead)
    co_bought_pairs = await _get_frequent_cobought_pairs(
        db,
        limit=payload.top_products_limit,
        period_start=period_start,
        period_end=period_end,
        branch_id=payload.branch_id,
    )
    sales_summary = await get_sales_period_summary(
        db,
        period_start=period_start,
        period_end=period_end,
        branch_id=payload.branch_id,
    )
    customer_aggregates = await get_customer_purchase_aggregates(
        db,
        period_start=period_start,
        period_end=period_end,
        branch_id=payload.branch_id,
    )
    promotion_performance = await get_promotion_performance(db, limit=5)

    if payload.branch_id is not None:
        expiring_inventory = [
            x for x in expiring_inventory if x.get("branch_id") == payload.branch_id
        ]

    facts: dict[str, Any] = {
        "branch_id": payload.branch_id,
        "analysis_period": {
            "lookback_days": payload.lookback_days,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "expiry_horizon_days": payload.days_ahead,
        },
        "sales_summary": sales_summary,
        "customer_aggregates": customer_aggregates,
        "top_selling_products": top_products,
        "slow_moving_products": slow_products,
        "expiring_inventory": expiring_inventory,
        "co_bought_pairs": co_bought_pairs,
        "promotion_performance": promotion_performance,
        "generated_at": datetime.now(UTC).isoformat(),
    }

    deterministic = _build_fallback_suggestions(facts, payload.max_suggestions)
    model_name = "deterministic_fallback"
    suggestions = deterministic
    llm_usage: dict[str, int] | None = None

    if settings.OPENAI_API_KEY:
        try:
            envelope, llm_usage = await call_llm_json(
                system_prompt=_SYSTEM_PROMPT,
                user_payload={
                    "max_suggestions": payload.max_suggestions,
                    "facts": facts,
                    "deterministic_suggestions": [s.model_dump() for s in deterministic],
                    "instructions": (
                        "Improve Arabic wording and prioritization using only facts. "
                        "You may refine deterministic_suggestions but must stay grounded."
                    ),
                },
                response_model=_LLMAdvisoryEnvelope,
                max_tokens=1200,
            )
            suggestions = envelope.suggestions[: payload.max_suggestions]
            model_name = settings.OPENAI_MODEL
        except ExternalServiceError:
            suggestions = deterministic
            llm_usage = None
            model_name = "deterministic_fallback"

    return (
        MarketingAdvisoryResponse(
            model=model_name,
            generated_at=datetime.now(UTC),
            facts_used=facts,
            suggestions=suggestions,
        ),
        llm_usage,
    )
