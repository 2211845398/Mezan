"""In-process push provider used for development and tests.

Accepts every send and returns a synthetic ``message_id``. Tokens starting with
``invalid:`` are reported as invalid so tests can exercise the stale-token
pruning path.
"""

from __future__ import annotations

from uuid import uuid4

from app.services.notifications.providers.base import PushProvider, PushSendResult


class MockPushProvider(PushProvider):
    name: str = "mock"

    async def send(
        self,
        *,
        token: str,
        title: str,
        body: str,
        data: dict,
    ) -> PushSendResult:
        if token.startswith("invalid:"):
            return PushSendResult(
                success=False,
                message_id=None,
                error_code="INVALID_TOKEN",
                error_message="Mock provider: token marked invalid",
                token_invalid=True,
            )
        return PushSendResult(
            success=True,
            message_id=f"mock-{uuid4().hex}",
            error_code=None,
            error_message=None,
            token_invalid=False,
        )
