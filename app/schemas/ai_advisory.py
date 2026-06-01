"""Pydantic schemas for Epic 14 AI advisory services.

One request/response pair per advisor. All responses include ``facts_used``
so the operator can inspect exactly what the model was allowed to see.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

# ── Purchase reorder advisor ─────────────────────────────────────────────────


class PurchaseReorderRequest(BaseModel):
    branch_id: int | None = None
    lookback_days: int = Field(default=30, ge=7, le=365)
    lead_time_days: int = Field(default=7, ge=1, le=180)
    safety_stock_days: int = Field(default=3, ge=0, le=60)
    max_suggestions: int = Field(default=20, ge=1, le=100)


class PurchaseReorderSuggestion(BaseModel):
    product_id: int
    product_name: str
    branch_id: int | None
    current_on_hand: int
    average_daily_sales: float
    recommended_order_qty: int
    recommended_supplier_id: int | None = None
    rationale: str
    urgency: Literal["high", "medium", "low"]
    confidence: float


class PurchaseReorderResponse(BaseModel):
    model: str
    generated_at: datetime
    facts_used: dict
    suggestions: list[PurchaseReorderSuggestion]


# ── HR anomaly advisor ───────────────────────────────────────────────────────


class HrAnomalyRequest(BaseModel):
    """HR anomaly detection request (Epic 23.5: presets supported).

    Use preset="last_month" for quick last-month analysis,
    or specify lookback_days manually.
    """

    preset: Literal["last_month", "last_14_days", "last_7_days", "custom"] = Field(
        default="last_month"
    )
    lookback_days: int = Field(default=30, ge=1, le=90)
    employee_ids: list[int] | None = None
    branch_id: int | None = None
    max_anomalies: int = Field(default=20, ge=1, le=100)

    def get_lookback_days(self) -> int:
        """Resolve lookback days from preset or explicit value."""
        if self.preset == "last_month":
            return 30
        if self.preset == "last_14_days":
            return 14
        if self.preset == "last_7_days":
            return 7
        return self.lookback_days


class HrAnomaly(BaseModel):
    employee_profile_id: int
    employee_name: str | None = None
    branch_id: int | None
    anomaly_type: Literal[
        "excessive_overtime",
        "missing_clock_out",
        "outside_schedule",
        "unusual_pattern",
        "scheduled_absence",
        "continuous_shift",
    ]
    period_start: datetime
    period_end: datetime
    observed_value: float
    expected_value: float | None
    rationale: str
    severity: Literal["high", "medium", "low"]
    confidence: float


class HrAnomalyResponse(BaseModel):
    model: str
    generated_at: datetime
    facts_used: dict
    anomalies: list[HrAnomaly]


# ── Targeted campaign advisor ────────────────────────────────────────────────


class TargetedCampaignRequest(BaseModel):
    lookback_days: int = Field(default=90, ge=14, le=365)
    min_purchases: int = Field(default=2, ge=1, le=50)
    max_campaigns: int = Field(default=5, ge=1, le=20)


class CampaignSegment(BaseModel):
    segment_code: str
    description: str
    customer_count: int
    average_order_value: Decimal
    rationale: str


class TargetedCampaign(BaseModel):
    title: str
    segment: CampaignSegment
    channel: Literal["sms", "email", "push", "in_store"]
    offer: str
    call_to_action: str
    expected_lift_pct: float
    confidence: float


class TargetedCampaignResponse(BaseModel):
    model: str
    generated_at: datetime
    facts_used: dict
    campaigns: list[TargetedCampaign]


class CampaignSegmentExportRequest(BaseModel):
    """Export customer_id rows for a deterministic segment bucket."""

    segment_code: str = Field(min_length=1, max_length=32)
    lookback_days: int = Field(default=90, ge=14, le=365)
    min_purchases: int = Field(default=2, ge=1, le=50)


# ── Invoice-to-catalog matcher ───────────────────────────────────────────────


class InvoiceMatchRequest(BaseModel):
    invoice_scan_id: int
    max_candidates_per_line: int = Field(default=5, ge=1, le=20)


class InvoiceLineMatchCandidate(BaseModel):
    product_id: int
    product_name: str
    sku: str | None = None
    barcode: str | None = None
    confidence: float
    rationale: str


class InvoiceLineMatch(BaseModel):
    line_no: int
    raw_description: str
    best_match_product_id: int | None
    candidates: list[InvoiceLineMatchCandidate]
    needs_human_confirmation: bool


class InvoiceMatchResponse(BaseModel):
    model: str
    generated_at: datetime
    invoice_scan_id: int
    facts_used: dict
    line_matches: list[InvoiceLineMatch]
