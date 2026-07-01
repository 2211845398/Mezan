"""Marketing advisory service: facts assembly and LLM/fallback paths."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.marketing_advisory import MarketingAdvisoryRequest, MarketingSuggestion
from app.services.marketing_advisory_service import (
    _build_fallback_suggestions,
    generate_marketing_advisory,
)


def test_build_fallback_suggestions_respects_max() -> None:
    facts = {
        "expiring_inventory": [{"product_name": "Milk"}],
        "slow_moving_products": [{"product_name": "Tea"}],
        "top_selling_products": [{"product_name": "Bread"}],
        "co_bought_pairs": [
            {"product_a_name": "A", "product_b_name": "B", "pair_count": 3},
        ],
        "customer_aggregates": {"active_customers": 10, "repeat_rate_pct": 10.0},
    }
    out = _build_fallback_suggestions(facts, max_suggestions=2)
    assert len(out) == 2
    assert all(isinstance(s, MarketingSuggestion) for s in out)


@pytest.mark.anyio
async def test_generate_marketing_advisory_uses_deterministic_fallback_without_openai(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.marketing_advisory_service.settings.OPENAI_API_KEY", None)

    response, usage = await generate_marketing_advisory(
        db_session,
        payload=MarketingAdvisoryRequest(
            branch_id=None,
            lookback_days=30,
            days_ahead=30,
            top_products_limit=5,
            max_suggestions=5,
        ),
    )
    assert usage is None
    assert response.model == "deterministic_fallback"
    assert isinstance(response.suggestions, list)
    assert "analysis_period" in response.facts_used
    assert response.facts_used["analysis_period"]["lookback_days"] == 30
    assert "sales_summary" in response.facts_used
    assert "customer_aggregates" in response.facts_used
    assert "promotion_performance" in response.facts_used


@pytest.mark.anyio
async def test_generate_marketing_advisory_facts_include_period_bounds(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.marketing_advisory_service.settings.OPENAI_API_KEY", None)

    response, _ = await generate_marketing_advisory(
        db_session,
        payload=MarketingAdvisoryRequest(lookback_days=60),
    )
    period = response.facts_used["analysis_period"]
    assert period["lookback_days"] == 60
    assert period["period_start"]
    assert period["period_end"]
