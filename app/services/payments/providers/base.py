"""Payment provider abstraction."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass
class ProviderPaymentResult:
    status: str
    external_id: str
    payload: dict


class PaymentProvider:
    name: str = "base"

    async def create_intent(self, *, amount: Decimal, currency: str) -> ProviderPaymentResult:
        raise NotImplementedError

    async def capture(
        self, *, external_id: str, amount: Decimal, idempotency_key: str
    ) -> ProviderPaymentResult:
        raise NotImplementedError
