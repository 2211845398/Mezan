"""Deterministic-facts AI advisory service for marketing decisions."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import httpx
from pydantic import BaseModel, ValidationError as PydanticValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ExternalServiceError
from app.models.product import Product
from app.models.sales_invoice import SalesInvoiceLine
from app.schemas.marketing_advisory import (
    MarketingAdvisoryRequest,
    MarketingAdvisoryResponse,
    MarketingSuggestion,
)
from app.services.analytics_service import (
    get_inventory_alerts,
    get_slow_moving_products,
    get_top_selling_products,
)


class _LLMAdvisoryEnvelope(BaseModel):
    suggestions: list[MarketingSuggestion]


async def _get_frequent_cobought_pairs(
    db: AsyncSession, *, limit: int = 10
) -> list[dict[str, Any]]:
    left = SalesInvoiceLine.__table__.alias("left_line")
    right = SalesInvoiceLine.__table__.alias("right_line")
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


def _build_fallback_suggestions(facts: dict[str, Any], max_suggestions: int) -> list[MarketingSuggestion]:
    suggestions: list[MarketingSuggestion] = []
    expiring = facts.get("expiring_inventory") or []
    if expiring:
        top = expiring[0]
        suggestions.append(
            MarketingSuggestion(
                title=f"Promote expiring stock: {top.get('product_name')}",
                rationale="Inventory alert indicates upcoming expiry with on-hand quantity.",
                action_items=[
                    "Create a limited-time discount on expiring items",
                    "Place the product in high-visibility channels",
                ],
                priority="high",
                confidence=0.82,
            )
        )

    slow_items = facts.get("slow_moving_products") or []
    if slow_items:
        top = slow_items[0]
        suggestions.append(
            MarketingSuggestion(
                title=f"Bundle slow mover: {top.get('product_name')}",
                rationale="Low velocity item is suitable for bundle or upsell strategy.",
                action_items=[
                    "Bundle with top seller for cross-sell",
                    "Run short trial promotion and monitor conversion",
                ],
                priority="medium",
                confidence=0.75,
            )
        )

    top_products = facts.get("top_selling_products") or []
    if top_products:
        top = top_products[0]
        suggestions.append(
            MarketingSuggestion(
                title=f"Upsell around bestseller: {top.get('product_name')}",
                rationale="Top-selling products are anchors for campaign uplift.",
                action_items=[
                    "Launch complementary product recommendations",
                    "Allocate extra display budget for this category",
                ],
                priority="medium",
                confidence=0.73,
            )
        )

    co_bought = facts.get("co_bought_pairs") or []
    if co_bought:
        pair = co_bought[0]
        suggestions.append(
            MarketingSuggestion(
                title=f"Bundle pair: {pair.get('product_a_name')} + {pair.get('product_b_name')}",
                rationale="Frequent co-purchase pattern supports bundle conversion uplift.",
                action_items=[
                    "Create a combo offer for the top co-bought pair",
                    "A/B test bundle pricing versus separate discounts",
                ],
                priority="medium",
                confidence=0.78,
            )
        )

    return suggestions[:max_suggestions]


def _build_messages(facts: dict[str, Any], max_suggestions: int) -> list[dict[str, str]]:
    system_prompt = (
        "You are a retail marketing advisor. "
        "Use only the provided facts and return strict JSON matching this schema: "
        '{"suggestions":[{"title":"...","rationale":"...","action_items":["..."],'
        '"priority":"high|medium|low","confidence":0.0}]} '
        "Do not include any text outside JSON."
    )
    user_prompt = (
        f"Generate up to {max_suggestions} actionable suggestions using this facts payload:\n"
        f"{json.dumps(facts, default=str)}"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


async def _call_llm(messages: list[dict[str, str]]) -> _LLMAdvisoryEnvelope:
    if not settings.OPENAI_API_KEY:
        raise ExternalServiceError("OPENAI_API_KEY is not configured", http_status=503)

    url = f"{settings.OPENAI_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": settings.OPENAI_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.OPENAI_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(url, json=payload, headers=headers)
        if response.status_code >= 400:
            raise ExternalServiceError(
                "AI advisory request failed",
                details={"status_code": response.status_code, "body": response.text[:400]},
            )
        body = response.json()
        content = body["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return _LLMAdvisoryEnvelope.model_validate(parsed)
    except PydanticValidationError as exc:
        raise ExternalServiceError(
            "AI response schema validation failed",
            details={"errors": exc.errors()},
        ) from exc
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise ExternalServiceError(
            "AI response parsing failed",
            details={"error": str(exc)},
        ) from exc
    except httpx.HTTPError as exc:
        raise ExternalServiceError("AI provider HTTP error", details={"error": str(exc)}) from exc


async def generate_marketing_advisory(
    db: AsyncSession, *, payload: MarketingAdvisoryRequest
) -> MarketingAdvisoryResponse:
    top_products = await get_top_selling_products(db, limit=payload.top_products_limit)
    slow_products = await get_slow_moving_products(db, threshold_qty=5, limit=payload.top_products_limit)
    expiring_inventory = await get_inventory_alerts(db, days_ahead=payload.days_ahead)
    co_bought_pairs = await _get_frequent_cobought_pairs(db, limit=payload.top_products_limit)

    if payload.branch_id is not None:
        expiring_inventory = [x for x in expiring_inventory if x.get("branch_id") == payload.branch_id]

    facts = {
        "branch_id": payload.branch_id,
        "top_selling_products": top_products,
        "slow_moving_products": slow_products,
        "expiring_inventory": expiring_inventory,
        "co_bought_pairs": co_bought_pairs,
        "generated_at": datetime.now(UTC).isoformat(),
    }
    try:
        envelope = await _call_llm(_build_messages(facts, payload.max_suggestions))
        suggestions = envelope.suggestions[: payload.max_suggestions]
    except ExternalServiceError:
        suggestions = _build_fallback_suggestions(facts, payload.max_suggestions)

    return MarketingAdvisoryResponse(
        model=settings.OPENAI_MODEL if settings.OPENAI_API_KEY else "deterministic_fallback",
        generated_at=datetime.now(UTC),
        facts_used=facts,
        suggestions=suggestions,
    )
