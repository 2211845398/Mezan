"""Firebase Cloud Messaging (HTTP v1) provider.

Design
------
- Uses the HTTP v1 endpoint ``https://fcm.googleapis.com/v1/projects/{project_id}/messages:send``.
- An OAuth2 access token is minted from the service-account JSON via
  ``google-auth`` (scope ``https://www.googleapis.com/auth/firebase.messaging``).
- The ``google-auth`` and ``httpx`` packages are the only runtime dependencies;
  ``firebase-admin`` is intentionally **not** used so we avoid its heavy
  transitive graph (we do not need Firestore, Realtime DB, or Firebase Auth).
- Credentials may be provided by either ``FCM_CREDENTIALS_PATH`` (file) or
  ``FCM_CREDENTIALS_JSON`` (inline JSON, handy for secret stores).
- Tokens that FCM rejects with ``UNREGISTERED`` or ``INVALID_ARGUMENT``
  (mentioning ``registration token``) are flagged as invalid so the service
  layer can revoke them.

This class is intentionally tolerant of missing dependencies: importing it must
not crash the app on dev machines that have not installed ``google-auth`` or
configured credentials. Instead, ``send`` raises a clear
``ExternalServiceError`` at call time, matching the behavior of the OpenAI
advisory path.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import ExternalServiceError
from app.services.notifications.providers.base import PushProvider, PushSendResult

_FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_FCM_ENDPOINT_TEMPLATE = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"


def _load_service_account_info() -> dict[str, Any]:
    """Read the FCM service-account credentials from config."""
    inline = settings.FCM_CREDENTIALS_JSON
    if inline:
        try:
            parsed = json.loads(inline)
        except json.JSONDecodeError as exc:
            raise ExternalServiceError(
                "FCM_CREDENTIALS_JSON is not valid JSON",
                details={"error": str(exc)},
                http_status=503,
            ) from exc
        if isinstance(parsed, dict):
            return parsed
        raise ExternalServiceError(
            "FCM_CREDENTIALS_JSON must decode to a JSON object",
            http_status=503,
        )

    path = settings.FCM_CREDENTIALS_PATH
    if not path:
        raise ExternalServiceError(
            "FCM credentials are not configured",
            details={"hint": "Set FCM_CREDENTIALS_PATH or FCM_CREDENTIALS_JSON"},
            http_status=503,
        )
    file_path = Path(path)
    if not file_path.exists():
        raise ExternalServiceError(
            "FCM credentials file not found",
            details={"path": path},
            http_status=503,
        )
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ExternalServiceError(
            "FCM credentials file is not valid JSON",
            details={"path": path, "error": str(exc)},
            http_status=503,
        ) from exc


class FcmPushProvider(PushProvider):
    """Production FCM push provider. Safe to import when credentials are absent."""

    name: str = "fcm"

    def __init__(self) -> None:
        self._credentials = None
        self._project_id: str | None = None

    def _ensure_credentials(self) -> None:
        if self._credentials is not None:
            return
        try:
            from google.oauth2 import service_account  # type: ignore[import-not-found]
        except ImportError as exc:
            raise ExternalServiceError(
                "google-auth is not installed; cannot use FCM provider",
                details={"hint": "uv add google-auth"},
                http_status=503,
            ) from exc
        info = _load_service_account_info()
        self._project_id = info.get("project_id")
        if not self._project_id:
            raise ExternalServiceError(
                "FCM credentials are missing project_id",
                http_status=503,
            )
        self._credentials = service_account.Credentials.from_service_account_info(
            info, scopes=[_FCM_SCOPE]
        )

    def _access_token(self) -> str:
        assert self._credentials is not None  # set by _ensure_credentials
        try:
            from google.auth.transport.requests import Request  # type: ignore[import-not-found]
        except ImportError as exc:
            raise ExternalServiceError(
                "google-auth transport is not installed",
                details={"hint": "uv add google-auth"},
                http_status=503,
            ) from exc
        if not self._credentials.valid:
            self._credentials.refresh(Request())
        return str(self._credentials.token)

    @staticmethod
    def _classify_error(status_code: int, body: dict[str, Any]) -> tuple[str, str, bool]:
        err = body.get("error") or {}
        status = str(err.get("status") or "")
        message = str(err.get("message") or "FCM request failed")
        token_invalid = status in {"UNREGISTERED", "NOT_FOUND"} or (
            status == "INVALID_ARGUMENT" and "registration token" in message.lower()
        )
        code = status or f"http_{status_code}"
        return code, message, token_invalid

    async def send(
        self,
        *,
        token: str,
        title: str,
        body: str,
        data: dict,
    ) -> PushSendResult:
        self._ensure_credentials()
        bearer = self._access_token()
        url = _FCM_ENDPOINT_TEMPLATE.format(project_id=self._project_id)
        string_data = {k: str(v) for k, v in (data or {}).items()}
        payload = {
            "message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": string_data,
            }
        }
        headers = {
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/json; charset=UTF-8",
        }
        try:
            async with httpx.AsyncClient(timeout=settings.PUSH_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            return PushSendResult(
                success=False,
                message_id=None,
                error_code="network_error",
                error_message=str(exc),
                token_invalid=False,
            )
        if response.status_code >= 400:
            try:
                parsed = response.json()
            except ValueError:
                parsed = {}
            code, message, token_invalid = self._classify_error(response.status_code, parsed)
            return PushSendResult(
                success=False,
                message_id=None,
                error_code=code,
                error_message=message[:500],
                token_invalid=token_invalid,
            )
        try:
            body_json = response.json()
        except ValueError:
            body_json = {}
        return PushSendResult(
            success=True,
            message_id=body_json.get("name"),
            error_code=None,
            error_message=None,
            token_invalid=False,
        )
