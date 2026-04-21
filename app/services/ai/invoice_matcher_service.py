"""Invoice-to-catalog product matcher (Epic 14.4).

Facts:
- The parsed line items of a completed invoice scan (``parsed_output`` or the
  fallback ``raw_output.structured.line_items``).
- A compact projection of active catalog products (id, name, sku, barcode).

Output: for each invoice line, up to ``max_candidates_per_line`` candidate
products with a confidence score and a rationale. ``best_match_product_id`` is
suggested only when a candidate exceeds a fixed confidence threshold (0.8) on
the deterministic scorer; otherwise the match is flagged as requiring human
confirmation. **No mutation of invoice scans or product rows is performed by
this service** — the endpoint is read-only and intended to surface suggestions
to the validation UI.

Determinism: the fallback scorer uses exact barcode → exact SKU → token-overlap
on normalized names, which is stable and explainable.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ExternalServiceError, NotFoundError
from app.models.invoice_scan import InvoiceScan
from app.models.product import Product
from app.schemas.ai_advisory import (
    InvoiceLineMatch,
    InvoiceLineMatchCandidate,
    InvoiceMatchRequest,
    InvoiceMatchResponse,
)
from app.services.ai.llm_client import call_llm_json


class _LLMMatchEnvelope(BaseModel):
    line_matches: list[InvoiceLineMatch]


_SYSTEM_PROMPT = (
    "You are a retail catalog matcher. Using ONLY the provided invoice lines "
    "and product candidates, return strict JSON: "
    '{"line_matches":[{"line_no":int,"raw_description":str,'
    '"best_match_product_id":int|null,"candidates":[{"product_id":int,'
    '"product_name":str,"sku":str|null,"barcode":str|null,"confidence":0.0,'
    '"rationale":str}],"needs_human_confirmation":bool}]} '
    "Never invent product_id values; use only ids from the provided candidates. "
    "No text outside JSON."
)

_HIGH_CONFIDENCE = 0.8
_TOKEN_SPLIT = re.compile(r"[\s\-_/|,;:()\[\]]+")


def _normalize(text: str) -> list[str]:
    return [tok for tok in _TOKEN_SPLIT.split((text or "").lower()) if tok]


def _token_overlap_score(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    set_a, set_b = set(a), set(b)
    inter = set_a & set_b
    union = set_a | set_b
    return len(inter) / len(union)


def _score_candidates(
    *,
    raw_description: str,
    raw_barcode: str | None,
    raw_sku: str | None,
    products: list[dict[str, Any]],
    top_k: int,
) -> list[InvoiceLineMatchCandidate]:
    desc_tokens = _normalize(raw_description)
    scored: list[tuple[float, dict[str, Any], str]] = []
    for p in products:
        if raw_barcode and p.get("barcode") and raw_barcode.strip() == p["barcode"]:
            scored.append((1.0, p, "Exact barcode match."))
            continue
        if raw_sku and p.get("sku") and raw_sku.strip().lower() == p["sku"].lower():
            scored.append((0.95, p, "Exact SKU match."))
            continue
        name_tokens = _normalize(p.get("name") or "")
        overlap = _token_overlap_score(desc_tokens, name_tokens)
        if overlap > 0:
            scored.append(
                (round(overlap, 4), p, f"Token overlap score {overlap:.2f} on product name.")
            )
    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        InvoiceLineMatchCandidate(
            product_id=p["id"],
            product_name=p["name"],
            sku=p.get("sku"),
            barcode=p.get("barcode"),
            confidence=score,
            rationale=rationale,
        )
        for score, p, rationale in scored[:top_k]
    ]


def _extract_line_items(scan: InvoiceScan) -> list[dict[str, Any]]:
    """Pull the canonical list of parsed line items from the scan row."""
    parsed = scan.override_output or scan.parsed_output
    if isinstance(parsed, dict):
        items = parsed.get("line_items")
        if isinstance(items, list):
            return [i for i in items if isinstance(i, dict)]
    raw = scan.raw_output or {}
    structured = raw.get("structured") if isinstance(raw, dict) else None
    if isinstance(structured, dict):
        items = structured.get("line_items")
        if isinstance(items, list):
            return [i for i in items if isinstance(i, dict)]
    return []


async def _load_product_pool(db: AsyncSession, *, limit: int = 1000) -> list[dict[str, Any]]:
    stmt = (
        select(Product.id, Product.name, Product.sku, Product.barcode)
        .where(Product.status == "active")
        .order_by(Product.id.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [
        {"id": int(r.id), "name": r.name, "sku": r.sku, "barcode": r.barcode} for r in result.all()
    ]


async def match_invoice_scan(
    db: AsyncSession, *, payload: InvoiceMatchRequest
) -> InvoiceMatchResponse:
    result = await db.execute(select(InvoiceScan).where(InvoiceScan.id == payload.invoice_scan_id))
    scan = result.scalar_one_or_none()
    if scan is None:
        raise NotFoundError("Invoice scan not found", details={"id": payload.invoice_scan_id})

    line_items = _extract_line_items(scan)
    products = await _load_product_pool(db)

    deterministic_matches: list[InvoiceLineMatch] = []
    for idx, item in enumerate(line_items):
        raw_desc = str(
            item.get("description")
            or item.get("name")
            or item.get("product_name")
            or item.get("raw")
            or ""
        )
        candidates = _score_candidates(
            raw_description=raw_desc,
            raw_barcode=item.get("barcode"),
            raw_sku=item.get("sku"),
            products=products,
            top_k=payload.max_candidates_per_line,
        )
        best = candidates[0] if candidates else None
        needs_review = not best or best.confidence < _HIGH_CONFIDENCE
        deterministic_matches.append(
            InvoiceLineMatch(
                line_no=int(item.get("line_no") or idx + 1),
                raw_description=raw_desc,
                best_match_product_id=(
                    best.product_id if best and best.confidence >= _HIGH_CONFIDENCE else None
                ),
                candidates=candidates,
                needs_human_confirmation=needs_review,
            )
        )

    facts = {
        "invoice_scan_id": scan.id,
        "line_count": len(line_items),
        "candidate_pool_size": len(products),
        "generated_at": datetime.now(UTC).isoformat(),
    }

    model_name = "deterministic_fallback"
    line_matches = deterministic_matches

    if settings.OPENAI_API_KEY and deterministic_matches:
        try:
            envelope = await call_llm_json(
                system_prompt=_SYSTEM_PROMPT,
                user_payload={
                    "request": payload.model_dump(),
                    "deterministic_matches": [m.model_dump() for m in deterministic_matches],
                    "instructions": (
                        "Re-rank candidates and set best_match_product_id only if a "
                        "candidate has clearly the highest confidence. Never add a "
                        "product_id absent from the provided candidates. Always flag "
                        "needs_human_confirmation=true when the top candidate confidence "
                        "is below 0.8."
                    ),
                },
                response_model=_LLMMatchEnvelope,
                max_tokens=2000,
            )
            allowed_ids_per_line: dict[int, set[int]] = {
                m.line_no: {c.product_id for c in m.candidates} for m in deterministic_matches
            }
            cleaned: list[InvoiceLineMatch] = []
            for m in envelope.line_matches:
                allowed = allowed_ids_per_line.get(m.line_no, set())
                safe_candidates = [c for c in m.candidates if c.product_id in allowed]
                best = None
                if m.best_match_product_id is not None and m.best_match_product_id in allowed:
                    best = m.best_match_product_id
                cleaned.append(
                    InvoiceLineMatch(
                        line_no=m.line_no,
                        raw_description=m.raw_description,
                        best_match_product_id=best,
                        candidates=safe_candidates,
                        needs_human_confirmation=m.needs_human_confirmation or best is None,
                    )
                )
            if cleaned:
                line_matches = cleaned
                model_name = settings.OPENAI_MODEL
        except ExternalServiceError:
            line_matches = deterministic_matches

    return InvoiceMatchResponse(
        model=model_name,
        generated_at=datetime.now(UTC),
        invoice_scan_id=scan.id,
        facts_used=facts,
        line_matches=line_matches,
    )
