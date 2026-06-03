"""Application error types for consistent API responses.

These errors are safe to surface to clients via the global exception handlers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, NoReturn

JsonObject = dict[str, Any]

# Top-level AppError.code values that are not business-specific i18n keys.
_GENERIC_ERROR_CODES = frozenset(
    {
        "validation_error",
        "conflict",
        "resource_not_found",
        "invalid_state_transition",
        "permission_denied",
        "not_authenticated",
        "external_service_error",
        "bad_request",
        "http_error",
        "rate_limited",
        "internal_error",
    }
)


@dataclass(eq=False)
class AppError(Exception):
    """Base application error with a stable machine-readable code."""

    code: str
    message: str
    http_status: int = 400
    details: JsonObject | None = None

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.code}: {self.message}"


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found", *, details: JsonObject | None = None):
        super().__init__("resource_not_found", message, 404, details)


class ValidationError(AppError):
    def __init__(self, message: str = "Invalid request", *, details: JsonObject | None = None):
        super().__init__("validation_error", message, 422, details)


class ConflictError(AppError):
    def __init__(self, message: str = "Conflict", *, details: JsonObject | None = None):
        super().__init__("conflict", message, 409, details)


class StateTransitionError(AppError):
    def __init__(
        self,
        message: str = "Invalid state transition",
        *,
        details: JsonObject | None = None,
    ):
        super().__init__("invalid_state_transition", message, 409, details)


class PermissionDeniedError(AppError):
    def __init__(self, message: str = "Permission denied", *, details: JsonObject | None = None):
        super().__init__("permission_denied", message, 403, details)


class NotAuthenticatedError(AppError):
    def __init__(self, message: str = "Not authenticated", *, details: JsonObject | None = None):
        super().__init__("not_authenticated", message, 401, details)


class ExternalServiceError(AppError):
    def __init__(
        self,
        message: str = "External service error",
        *,
        details: JsonObject | None = None,
        http_status: int = 502,
    ):
        super().__init__("external_service_error", message, http_status, details)


def _details_with_code(code: str, details: JsonObject | None = None, **extra: Any) -> JsonObject:
    merged: JsonObject = dict(details or {})
    merged.update(extra)
    merged["code"] = code
    return merged


def _default_message(code: str, message: str) -> str:
    return message or code.replace("_", " ")


def validation_error(
    code: str,
    message: str = "",
    *,
    details: JsonObject | None = None,
    **extra: Any,
) -> NoReturn:
    """Raise ValidationError with a stable ``details.code`` for UI i18n."""
    raise ValidationError(
        _default_message(code, message),
        details=_details_with_code(code, details, **extra),
    )


def state_transition_error(
    code: str,
    message: str = "",
    *,
    details: JsonObject | None = None,
    **extra: Any,
) -> NoReturn:
    """Raise StateTransitionError with a stable ``details.code`` for UI i18n."""
    raise StateTransitionError(
        _default_message(code, message),
        details=_details_with_code(code, details, **extra),
    )


def conflict_error(
    code: str,
    message: str = "",
    *,
    details: JsonObject | None = None,
    **extra: Any,
) -> NoReturn:
    """Raise ConflictError with a stable ``details.code`` for UI i18n."""
    raise ConflictError(
        _default_message(code, message),
        details=_details_with_code(code, details, **extra),
    )


def not_found_error(
    code: str,
    message: str = "",
    *,
    details: JsonObject | None = None,
    **extra: Any,
) -> NoReturn:
    """Raise NotFoundError with a stable ``details.code`` for UI i18n."""
    raise NotFoundError(
        _default_message(code, message),
        details=_details_with_code(code, details, **extra),
    )
