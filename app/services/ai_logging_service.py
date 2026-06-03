"""AI usage logging and lightweight response cache metadata (Epic 23.1)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_usage_log import AIUsageLog

COST_RATES: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"prompt": 0.00015, "completion": 0.0006},
    "gpt-4o": {"prompt": 0.005, "completion": 0.015},
}

CACHE_TTL_HOURS = 24


def _hash_input(data: dict[str, Any]) -> str:
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()[:32]


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> Decimal:
    rates = COST_RATES.get(model, COST_RATES["gpt-4o-mini"])
    prompt_cost = (prompt_tokens / 1000) * rates["prompt"]
    completion_cost = (completion_tokens / 1000) * rates["completion"]
    return Decimal(str(prompt_cost + completion_cost)).quantize(Decimal("0.000001"))


async def log_ai_usage(
    db: AsyncSession,
    *,
    endpoint: str,
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    request_payload: dict | None,
    response_summary: str | None,
    user_id: int | None,
    duration_ms: int | None,
    status: str = "success",
    error_message: str | None = None,
    cache_hit: bool = False,
    cache_key: str | None = None,
    response_summary_max_chars: int | None = 262_144,
) -> AIUsageLog:
    total_tokens = (prompt_tokens or 0) + (completion_tokens or 0)
    estimated_cost = None
    if prompt_tokens is not None and completion_tokens is not None:
        estimated_cost = _estimate_cost(model, prompt_tokens, completion_tokens)

    summary = response_summary or ""
    if response_summary_max_chars is not None and len(summary) > response_summary_max_chars:
        summary = summary[:response_summary_max_chars]

    log = AIUsageLog(
        endpoint=endpoint,
        model=model,
        prompt_hash=_hash_input(request_payload) if request_payload else None,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens if total_tokens > 0 else None,
        estimated_cost_usd=estimated_cost,
        cache_hit=cache_hit,
        cache_key=cache_key,
        request_payload=request_payload,
        response_summary=summary or None,
        user_id=user_id,
        duration_ms=duration_ms,
        status=status,
        error_message=error_message,
    )
    db.add(log)
    await db.flush()
    return log


async def get_cached_response(
    db: AsyncSession,
    *,
    endpoint: str,
    input_data: dict[str, Any],
    ttl_hours: int = CACHE_TTL_HOURS,
) -> dict | None:
    cache_key = _hash_input(input_data)
    cutoff = datetime.now(UTC) - timedelta(hours=ttl_hours)
    res = await db.execute(
        select(AIUsageLog)
        .where(
            AIUsageLog.endpoint == endpoint,
            AIUsageLog.cache_key == cache_key,
            AIUsageLog.created_at >= cutoff,
            AIUsageLog.status == "success",
        )
        .order_by(AIUsageLog.id.desc())
        .limit(1)
    )
    row = res.scalar_one_or_none()
    if not row or not row.response_summary:
        return None
    return {
        "cached": True,
        "response_summary": row.response_summary,
        "original_created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def save_cached_response(
    db: AsyncSession,
    *,
    endpoint: str,
    model: str,
    input_data: dict[str, Any],
    response_summary: str,
    user_id: int | None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
) -> AIUsageLog:
    cache_key = _hash_input(input_data)
    return await log_ai_usage(
        db,
        endpoint=endpoint,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        request_payload={"cache_key": cache_key},
        response_summary=response_summary,
        user_id=user_id,
        duration_ms=None,
        status="success",
        cache_hit=True,
        cache_key=cache_key,
    )


async def cleanup_expired_cache(db: AsyncSession, older_than_days: int = 7) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=older_than_days)
    res = await db.execute(delete(AIUsageLog).where(AIUsageLog.created_at < cutoff))
    return int(res.rowcount or 0)


async def get_usage_stats(
    db: AsyncSession,
    *,
    days: int = 30,
    user_id: int | None = None,
) -> dict:
    since = datetime.now(UTC) - timedelta(days=days)
    stmt = select(
        func.count(AIUsageLog.id).label("total_calls"),
        func.coalesce(func.sum(AIUsageLog.total_tokens), 0).label("total_tokens"),
        func.coalesce(func.sum(AIUsageLog.estimated_cost_usd), Decimal("0")).label("total_cost"),
        func.coalesce(func.sum(AIUsageLog.prompt_tokens), 0).label("total_prompt_tokens"),
        func.coalesce(func.sum(AIUsageLog.completion_tokens), 0).label("total_completion_tokens"),
        func.coalesce(
            func.sum(case((AIUsageLog.cache_hit.is_(True), 1), else_=0)),
            0,
        ).label("cache_hits"),
    ).where(AIUsageLog.created_at >= since)
    if user_id is not None:
        stmt = stmt.where(AIUsageLog.user_id == user_id)
    res = await db.execute(stmt)
    row = res.one()
    total_calls = int(row.total_calls or 0)
    cache_hits = int(row.cache_hits or 0)
    return {
        "period_days": days,
        "total_calls": total_calls,
        "total_tokens": int(row.total_tokens or 0),
        "total_cost_usd": row.total_cost or Decimal("0"),
        "prompt_tokens": int(row.total_prompt_tokens or 0),
        "completion_tokens": int(row.total_completion_tokens or 0),
        "cache_hits": cache_hits,
        "cache_hit_rate": (cache_hits / total_calls * 100) if total_calls else 0,
    }
