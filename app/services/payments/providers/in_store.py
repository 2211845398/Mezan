from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.services.payments.providers.base import PaymentProvider, ProviderPaymentResult


class InStoreLedgerProvider(PaymentProvider):
    """Internal provider for recording in-store tenders without gateway integration."""

    name = "in_store"

    async def create_intent(self, *, amount: float, currency: str) -> ProviderPaymentResult:
        return ProviderPaymentResult(
            status="requires_capture",
            external_id=f"instore_pi_{uuid.uuid4().hex}",
            payload={"amount": amount, "currency": currency, "mode": "ledger"},
        )

    async def capture(
        self, *, external_id: str, amount: float, idempotency_key: str
    ) -> ProviderPaymentResult:
        return ProviderPaymentResult(
            status="succeeded",
            external_id=external_id,
            payload={
                "captured_amount": amount,
                "idempotency_key": idempotency_key,
                "captured_at": datetime.now(UTC).isoformat(),
            },
        )
