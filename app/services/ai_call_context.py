"""Shared cache lookup + AI usage logging for advisor endpoints (Epic 14 / 23)."""

from __future__ import annotations

import json
import time
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai_logging_service import get_cached_response, log_ai_usage

T = TypeVar("T", bound=BaseModel)


async def load_cached_advisor_response(
    db: AsyncSession,
    *,
    endpoint: str,
    cache_input: dict[str, Any],
    response_model: type[T],
) -> T | None:
    blob = await get_cached_response(db, endpoint=endpoint, input_data=cache_input)
    if not blob:
        return None
    raw = blob.get("response_summary")
    if not raw or not str(raw).strip():
        return None
    try:
        return response_model.model_validate(json.loads(str(raw)))
    except (json.JSONDecodeError, ValueError):
        return None


async def finalize_advisor_run(
    db: AsyncSession,
    *,
    endpoint: str,
    user_id: int | None,
    cache_input: dict[str, Any],
    model: str,
    response: BaseModel,
    cache_hit: bool,
    started_at_perf: float,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    status: str = "success",
    error_message: str | None = None,
) -> None:
    duration_ms = int((time.perf_counter() - started_at_perf) * 1000)
    summary = json.dumps(response.model_dump(mode="json"), default=str)
    await log_ai_usage(
        db,
        endpoint=endpoint,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        request_payload=cache_input,
        response_summary=summary,
        user_id=user_id,
        duration_ms=duration_ms,
        status=status,
        error_message=error_message,
        cache_hit=cache_hit,
    )
