"""Shared LLM client for all AI advisory services.

Isolates the HTTP concern so each advisor focuses on its own facts and
schema. Mirrors the pattern established in
``marketing_advisory_service._call_llm``, but factored out for reuse by
purchase reorder / HR anomaly / campaign / invoice-match advisors.
"""

from __future__ import annotations

import json

import httpx
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from app.core.config import settings
from app.core.errors import ExternalServiceError


async def call_llm_json[T: BaseModel](
    *,
    system_prompt: str,
    user_payload: dict,
    response_model: type[T],
    max_tokens: int | None = None,
    temperature: float = 0.2,
) -> T:
    """Call the configured LLM, demand strict JSON, validate with Pydantic.

    Raises
    ------
    ExternalServiceError:
        - HTTP-level failure from the provider.
        - Missing / unparseable choices.
        - Schema validation failure on the returned JSON.
    """
    if not settings.OPENAI_API_KEY:
        raise ExternalServiceError("OPENAI_API_KEY is not configured", http_status=503)

    url = f"{settings.OPENAI_BASE_URL.rstrip('/')}/chat/completions"
    payload: dict = {
        "model": settings.OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps(user_payload, default=str, ensure_ascii=False),
            },
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.OPENAI_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise ExternalServiceError("AI provider HTTP error", details={"error": str(exc)}) from exc

    if response.status_code >= 400:
        raise ExternalServiceError(
            "AI advisory request failed",
            details={"status_code": response.status_code, "body": response.text[:400]},
        )
    try:
        body = response.json()
        content = body["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return response_model.model_validate(parsed)
    except PydanticValidationError as exc:
        raise ExternalServiceError(
            "AI response schema validation failed",
            details={"errors": exc.errors()},
        ) from exc
    except (KeyError, IndexError, ValueError, json.JSONDecodeError) as exc:
        raise ExternalServiceError(
            "AI response parsing failed", details={"error": str(exc)}
        ) from exc
