"""Purchase reorder advisor (Epic 14.1).

Facts: per-product average daily sales over a lookback window, current on-hand
per branch, and the product's most recent supplier. Recommendation: target
stock = (avg daily sales) × (lead_time_days + safety_stock_days); recommended
order = max(0, target - on_hand).

The advisor prefers a deterministic fallback for this case because the math is
simple, well-understood, and cheap. The LLM is used only to rationalize and
prioritize the list; it cannot invent products or quantities. Even when the
LLM responds, the service cross-checks every suggestion's ``product_id``
against the facts and silently drops hallucinated entries.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ExternalServiceError
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.sales_invoice import SalesInvoice, SalesInvoiceLine
from app.models.stock_level import StockLevel
from app.schemas.ai_advisory import (
    PurchaseReorderRequest,
    PurchaseReorderResponse,
    PurchaseReorderSuggestion,
)
from app.services.ai.llm_client import call_llm_json


class _LLMReorderEnvelope(BaseModel):
    suggestions: list[PurchaseReorderSuggestion]


_SYSTEM_PROMPT = (
    "You are a retail inventory planner. Using ONLY the provided facts, "
    "produce purchase reorder suggestions. Do not invent products. "
    "Return strict JSON matching this schema: "
    '{"suggestions":[{"product_id":int,"product_name":str,"branch_id":int|null,'
    '"current_on_hand":int,"average_daily_sales":number,'
    '"recommended_order_qty":int,"recommended_supplier_id":int|null,'
    '"rationale":str,"urgency":"high|medium|low","confidence":0.0}]} '
    "No text outside JSON."
)


async def _get_sales_velocity(
    db: AsyncSession, *, lookback_days: int, branch_id: int | None
) -> dict[int, float]:
    cutoff = datetime.now(UTC) - timedelta(days=lookback_days)
    stmt = (
        select(
            SalesInvoiceLine.product_id,
            func.coalesce(func.sum(SalesInvoiceLine.qty), 0).label("total_qty"),
        )
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceLine.sales_invoice_id)
        .where(SalesInvoice.voided_at.is_(None))
        .where(SalesInvoice.created_at >= cutoff)
        .group_by(SalesInvoiceLine.product_id)
    )
    if branch_id is not None:
        stmt = stmt.where(SalesInvoice.branch_id == branch_id)
    result = await db.execute(stmt)
    return {
        int(row.product_id): float(row.total_qty) / max(lookback_days, 1)
        for row in result.all()
        if row.total_qty is not None
    }


async def _get_stock_levels(db: AsyncSession, *, branch_id: int | None) -> list[dict]:
    stmt = (
        select(
            StockLevel.product_id,
            StockLevel.branch_id,
            StockLevel.on_hand,
            Product.name.label("product_name"),
        )
        .join(Product, Product.id == StockLevel.product_id)
        .where(Product.status == "active")
    )
    if branch_id is not None:
        stmt = stmt.where(StockLevel.branch_id == branch_id)
    result = await db.execute(stmt)
    return [
        {
            "product_id": int(row.product_id),
            "product_name": row.product_name,
            "branch_id": int(row.branch_id),
            "on_hand": int(row.on_hand),
        }
        for row in result.all()
    ]


async def _get_last_supplier_per_product(db: AsyncSession) -> dict[int, int]:
    """Return {product_id: last supplier_id seen on a PO line}."""
    subq = (
        select(
            PurchaseOrderLine.product_id,
            func.max(PurchaseOrder.id).label("latest_po_id"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .where(PurchaseOrder.supplier_id.isnot(None))
        .group_by(PurchaseOrderLine.product_id)
        .subquery()
    )
    stmt = (
        select(
            PurchaseOrderLine.product_id,
            PurchaseOrder.supplier_id,
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .join(
            subq,
            (subq.c.product_id == PurchaseOrderLine.product_id)
            & (subq.c.latest_po_id == PurchaseOrder.id),
        )
        .where(PurchaseOrder.supplier_id.isnot(None))
    )
    result = await db.execute(stmt)
    out: dict[int, int] = {}
    for row in result.all():
        out[int(row.product_id)] = int(row.supplier_id)
    return out


def _deterministic_suggestions(
    *,
    payload: PurchaseReorderRequest,
    stock_rows: list[dict],
    velocity: dict[int, float],
    supplier_by_product: dict[int, int],
) -> list[PurchaseReorderSuggestion]:
    coverage_days = payload.lead_time_days + payload.safety_stock_days
    out: list[PurchaseReorderSuggestion] = []
    for row in stock_rows:
        avg = velocity.get(row["product_id"], 0.0)
        target = avg * coverage_days
        shortfall = max(0, int(round(target - row["on_hand"])))
        if shortfall <= 0:
            continue
        # Urgency: out-of-stock with demand is high; <= 1 day cover is medium;
        # else low.
        if row["on_hand"] <= 0 and avg > 0:
            urgency = "high"
        elif avg > 0 and row["on_hand"] / max(avg, 1e-9) <= 1.0:
            urgency = "medium"
        else:
            urgency = "low"
        out.append(
            PurchaseReorderSuggestion(
                product_id=row["product_id"],
                product_name=row["product_name"],
                branch_id=row["branch_id"],
                current_on_hand=row["on_hand"],
                average_daily_sales=round(avg, 4),
                recommended_order_qty=shortfall,
                recommended_supplier_id=supplier_by_product.get(row["product_id"]),
                rationale=(
                    f"Avg daily sales {avg:.2f}; coverage needed "
                    f"{coverage_days}d ⇒ target {target:.0f}, on-hand {row['on_hand']}."
                ),
                urgency=urgency,
                confidence=0.88,
            )
        )
    out.sort(
        key=lambda s: (
            0 if s.urgency == "high" else 1 if s.urgency == "medium" else 2,
            -s.recommended_order_qty,
        )
    )
    return out[: payload.max_suggestions]


async def generate_purchase_reorder(
    db: AsyncSession, *, payload: PurchaseReorderRequest
) -> tuple[PurchaseReorderResponse, dict[str, int] | None]:
    velocity = await _get_sales_velocity(
        db, lookback_days=payload.lookback_days, branch_id=payload.branch_id
    )
    stock_rows = await _get_stock_levels(db, branch_id=payload.branch_id)
    supplier_by_product = await _get_last_supplier_per_product(db)

    facts = {
        "branch_id": payload.branch_id,
        "lookback_days": payload.lookback_days,
        "lead_time_days": payload.lead_time_days,
        "safety_stock_days": payload.safety_stock_days,
        "stock": stock_rows,
        "velocity": velocity,
        "supplier_by_product": supplier_by_product,
        "generated_at": datetime.now(UTC).isoformat(),
    }

    deterministic = _deterministic_suggestions(
        payload=payload,
        stock_rows=stock_rows,
        velocity=velocity,
        supplier_by_product=supplier_by_product,
    )

    model_name = "deterministic_fallback"
    suggestions = deterministic
    llm_usage: dict[str, int] | None = None
    if settings.OPENAI_API_KEY and deterministic:
        try:
            envelope, llm_usage = await call_llm_json(
                system_prompt=_SYSTEM_PROMPT,
                user_payload={
                    "request": payload.model_dump(),
                    "deterministic_suggestions": [s.model_dump() for s in deterministic],
                    "instructions": (
                        "Re-rank or merge the provided deterministic suggestions; "
                        "never introduce a product_id that is not in the list."
                    ),
                },
                response_model=_LLMReorderEnvelope,
                max_tokens=1200,
            )
            allowed_ids = {s.product_id for s in deterministic}
            filtered = [s for s in envelope.suggestions if s.product_id in allowed_ids]
            if filtered:
                suggestions = filtered[: payload.max_suggestions]
                model_name = settings.OPENAI_MODEL
        except ExternalServiceError:
            suggestions = deterministic
            llm_usage = None

    return (
        PurchaseReorderResponse(
            model=model_name,
            generated_at=datetime.now(UTC),
            facts_used=facts,
            suggestions=suggestions,
        ),
        llm_usage,
    )
