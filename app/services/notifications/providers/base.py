"""Push provider abstraction.

Every concrete provider (FCM, APNs, mock) must implement ``send`` and return a
``PushSendResult``. The service layer only speaks to this interface; swapping
providers is a configuration change, not a code change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PushSendResult:
    """Provider-neutral result of a single push attempt."""

    success: bool
    message_id: str | None
    error_code: str | None
    error_message: str | None
    token_invalid: bool = False


class PushProvider(Protocol):
    """Contract for a push notification provider."""

    name: str

    async def send(
        self,
        *,
        token: str,
        title: str,
        body: str,
        data: dict,
    ) -> PushSendResult: ...
