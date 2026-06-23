"""FastAPI exception handlers returning a stable error envelope."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.errors import AppError
from app.utils.validation_errors import normalize_pydantic_errors


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def _envelope(
    *,
    request: Request,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error": {"code": code, "message": message, "details": details or {}}
    }
    rid = _request_id(request)
    if rid:
        payload["request_id"] = rid
    return payload


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.http_status,
        content=_envelope(
            request=request,
            code=exc.code,
            message=exc.message,
            details=exc.details,
        ),
    )


def _code_from_status(status_code: int) -> str:
    return {
        400: "bad_request",
        401: "not_authenticated",
        403: "permission_denied",
        404: "resource_not_found",
        409: "conflict",
        422: "validation_error",
        429: "rate_limited",
    }.get(status_code, "http_error")


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    details: dict[str, Any] = {}
    if exc.detail is not None:
        # Preserve existing detail for backward compatibility with current code.
        details["detail"] = exc.detail
    return JSONResponse(
        status_code=exc.status_code,
        content=_envelope(
            request=request,
            code=_code_from_status(exc.status_code),
            message="Request failed",
            details=details,
        ),
        headers=getattr(exc, "headers", None),
    )


async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    raw_errors = exc.errors()
    return JSONResponse(
        status_code=422,
        content=_envelope(
            request=request,
            code="validation_error",
            message="Invalid request",
            details={"errors": normalize_pydantic_errors(raw_errors)},
        ),
    )


async def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content=_envelope(
            request=request,
            code="rate_limited",
            message="Too many requests",
            details={"detail": str(exc)},
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    details: dict[str, Any] = {}
    if settings.DEBUG:
        details["exception"] = exc.__class__.__name__
        details["message"] = str(exc)
    return JSONResponse(
        status_code=500,
        content=_envelope(
            request=request,
            code="internal_error",
            message="Internal server error",
            details=details,
        ),
    )
