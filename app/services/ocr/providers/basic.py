"""Basic OCR/QR extraction provider with optional Tesseract support."""

from __future__ import annotations

import base64
import json
import re
from io import BytesIO
from typing import Any

from app.services.ocr.providers.base import ExtractedInvoice


def _extract_text_from_base64_image(data: str) -> tuple[str, str]:
    payload = data
    if data.startswith("data:image"):
        payload = data.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(payload)
    except Exception:
        return data, "plain_text_fallback"
    try:
        from PIL import Image
        import pytesseract

        image = Image.open(BytesIO(image_bytes))
        text = pytesseract.image_to_string(image)
        return text.strip(), "tesseract"
    except Exception:
        # If OCR dependencies are unavailable, keep image bytes metadata only.
        return "", "raw_image"


def _parse_key_value_lines(text: str) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower().replace(" ", "_")
        parsed[key] = value.strip()
    return parsed


def _parse_line_items(text: str) -> list[dict[str, Any]]:
    """
    Supports lines such as:
    - product_id=12 qty=5 unit_cost=10.5
    - pid:12, qty:5, cost:10.5
    """
    line_items: list[dict[str, Any]] = []
    pattern = re.compile(
        r"(?:product_id|pid)\s*[:=]\s*(?P<product_id>\d+).*?"
        r"(?:qty|quantity)\s*[:=]\s*(?P<qty>\d+).*?"
        r"(?:unit_cost|cost|price)\s*[:=]\s*(?P<unit_cost>\d+(?:\.\d+)?)",
        re.IGNORECASE,
    )
    for line in text.splitlines():
        match = pattern.search(line)
        if not match:
            continue
        line_items.append(
            {
                "product_id": int(match.group("product_id")),
                "qty": int(match.group("qty")),
                "unit_cost": float(match.group("unit_cost")),
            }
        )
    return line_items


class BasicOcrProvider:
    name = "basic"

    async def extract_invoice(self, *, source_type: str, data: str) -> ExtractedInvoice:
        raw_text = ""
        parser = "plain_text"
        structured: dict[str, Any] = {}

        if source_type == "qr":
            try:
                structured = json.loads(data)
                parser = "qr_json"
                raw_text = data
            except json.JSONDecodeError:
                raw_text = data
                structured = _parse_key_value_lines(data)
                parser = "qr_key_value"
        elif source_type == "image":
            ocr_text, parser = _extract_text_from_base64_image(data)
            if ocr_text:
                raw_text = ocr_text
                structured = _parse_key_value_lines(ocr_text)
            else:
                raw_text = data
                structured = _parse_key_value_lines(data)
        else:
            raw_text = data
            structured = _parse_key_value_lines(data)

        if "line_items" not in structured:
            structured["line_items"] = _parse_line_items(raw_text)

        return ExtractedInvoice(
            payload={
                "source_type": source_type,
                "parser": parser,
                "raw_text": raw_text,
                "structured": structured,
            }
        )
