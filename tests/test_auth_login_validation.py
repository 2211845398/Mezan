"""Login request validation (schema + API envelope)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.auth import LoginRequest

pytestmark = pytest.mark.core


def test_login_request_rejects_short_password() -> None:
    with pytest.raises(ValidationError) as exc_info:
        LoginRequest(email="admin@example.com", password="short")

    errors = exc_info.value.errors()
    password_errors = [e for e in errors if e.get("loc") == ("password",)]
    assert password_errors
    assert password_errors[0]["type"] == "string_too_short"


@pytest.mark.asyncio
async def test_login_endpoint_returns_422_for_short_password(client) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "short"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    items = body["error"]["details"]["errors"]
    password_item = next(item for item in items if item["field"] == "password")
    assert password_item["code"] == "min_length"
    assert password_item["params"]["min_length"] == 8
