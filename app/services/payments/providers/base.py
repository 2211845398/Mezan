"""Payment provider abstraction."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ProviderPaymentResult:
    status: str
    external_id: str
    payload: dict


class PaymentProvider:
    name: str = "base"

    async def create_intent(self, *, amount: float, currency: str) -> ProviderPaymentResult:
        raise NotImplementedError

    async def capture(
        self, *, external_id: str, amount: float, idempotency_key: str
    ) -> ProviderPaymentResult:
        raise NotImplementedError
