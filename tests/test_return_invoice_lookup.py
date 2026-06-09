"""POS return invoice lookup — not-found vs credit-note (CRN) validation."""

from __future__ import annotations

import uuid

import pytest


async def _finalize_pos_invoice(client, admin_auth_header, commercial_branch_id) -> dict:
    code = f"POS-{uuid.uuid4().hex[:8]}"
    t = await client.post(
        "/api/v1/terminals",
        headers=admin_auth_header,
        json={"branch_id": commercial_branch_id, "name": code, "terminal_code": code},
    )
    assert t.status_code == 200, t.text
    terminal_id = t.json()["id"]
    auth_t = await client.patch(
        f"/api/v1/terminals/{terminal_id}/authorize",
        headers=admin_auth_header,
    )
    assert auth_t.status_code == 200, auth_t.text

    s = await client.post(
        "/api/v1/pos/shifts/open",
        headers=admin_auth_header,
        json={"terminal_id": terminal_id, "opening_float": 100.0},
    )
    assert s.status_code == 201, s.text
    shift_id = s.json()["id"]

    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={"name": "Lookup Cat", "slug": f"lc-{uuid.uuid4().hex[:6]}", "sort_order": 0, "is_active": True},
    )
    assert cat.status_code == 201, cat.text
    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cat.json()["id"],
            "name": "Lookup Item",
            "sku": f"LK-{uuid.uuid4().hex[:6]}",
            "status": "active",
            "sell_price": 25.0,
        },
    )
    assert prod.status_code == 201, prod.text
    product_id = prod.json()["id"]

    cart = await client.post(
        "/api/v1/pos/carts",
        headers=admin_auth_header,
        json={"terminal_id": terminal_id, "shift_id": shift_id},
    )
    assert cart.status_code == 201, cart.text
    cart_id = cart.json()["id"]

    line = await client.post(
        f"/api/v1/pos/carts/{cart_id}/lines",
        headers=admin_auth_header,
        json={"product_id": product_id, "qty": 1},
    )
    assert line.status_code == 200, line.text

    lock = await client.post(
        f"/api/v1/pos/carts/{cart_id}/state",
        headers=admin_auth_header,
        json={"action": "lock"},
    )
    assert lock.status_code == 200, lock.text

    pi = await client.post(
        "/api/v1/pos/payments/intents",
        headers=admin_auth_header,
        json={"cart_id": cart_id, "provider": "mock", "currency": "USD"},
    )
    assert pi.status_code == 201, pi.text
    payment_intent_id = pi.json()["id"]

    cap = await client.post(
        "/api/v1/pos/payments/capture",
        headers=admin_auth_header,
        json={
            "payment_intent_id": payment_intent_id,
            "idempotency_key": f"cap-{uuid.uuid4().hex}",
            "method": "card",
            "card_last4": "4242",
            "reference": "txn-lookup",
        },
    )
    assert cap.status_code == 200, cap.text

    finalize = await client.post(
        "/api/v1/pos/sales/finalize",
        headers=admin_auth_header,
        json={
            "cart_id": cart_id,
            "payment_intent_id": payment_intent_id,
            "idempotency_key": f"fin-{uuid.uuid4().hex}",
        },
    )
    assert finalize.status_code == 200, finalize.text
    return finalize.json()


@pytest.mark.asyncio
async def test_return_invoice_lookup_sale_credit_note_and_missing(
    client, admin_auth_header, commercial_branch_id
):
    invoice = await _finalize_pos_invoice(client, admin_auth_header, commercial_branch_id)
    barcode = invoice["invoice_barcode"]

    ok = await client.get(
        "/api/v1/pos/returns/invoice-lookup",
        headers=admin_auth_header,
        params={"invoice_barcode": barcode},
    )
    assert ok.status_code == 200, ok.text
    lookup = ok.json()
    assert lookup["invoice_barcode"] == barcode
    assert len(lookup["lines"]) >= 1
    line_id = lookup["lines"][0]["sales_invoice_line_id"]

    ret = await client.post(
        "/api/v1/pos/returns",
        headers=admin_auth_header,
        json={
            "invoice_barcode": barcode,
            "reason": "test",
            "lines": [{"sales_invoice_line_id": line_id, "qty": 1}],
        },
    )
    assert ret.status_code == 201, ret.text
    credit_number = ret.json()["credit_number"]
    assert credit_number.startswith("CRN-")

    crn_lookup = await client.get(
        "/api/v1/pos/returns/invoice-lookup",
        headers=admin_auth_header,
        params={"invoice_barcode": credit_number},
    )
    assert crn_lookup.status_code == 400, crn_lookup.text
    crn_body = crn_lookup.json()
    assert crn_body["error"]["message"] == "لا يمكن إرجاع فاتورة مرتجع"
    assert crn_body["error"]["details"]["code"] == "return_lookup_is_credit_note"

    missing = await client.get(
        "/api/v1/pos/returns/invoice-lookup",
        headers=admin_auth_header,
        params={"invoice_barcode": f"INV-MISSING-{uuid.uuid4().hex}"},
    )
    assert missing.status_code == 404, missing.text
    missing_body = missing.json()
    assert missing_body["error"]["message"] == "فاتورة البيع غير موجودة بالنظام"
    assert missing_body["error"]["details"]["code"] == "return_lookup_invoice_not_found"

    crn_post = await client.post(
        "/api/v1/pos/returns",
        headers=admin_auth_header,
        json={
            "invoice_barcode": credit_number,
            "reason": "test",
            "lines": [{"sales_invoice_line_id": line_id, "qty": 1}],
        },
    )
    assert crn_post.status_code == 400, crn_post.text
    assert crn_post.json()["error"]["details"]["code"] == "return_lookup_is_credit_note"
