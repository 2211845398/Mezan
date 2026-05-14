"""Per-route rate limits for LLM-backed advisors (slowapi string limits)."""

AI_RATE_LIMITS = {
    "marketing_advisory": "20/minute",
    "hr_anomalies": "10/minute",
    "purchase_reorder": "15/minute",
    "campaigns": "15/minute",
    "invoice_match": "20/minute",
}
