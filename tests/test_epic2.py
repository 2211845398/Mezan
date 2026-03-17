import pytest


@pytest.mark.asyncio
async def test_error_envelope_unauthenticated(client):
    resp = await client.get("/api/v1/categories")
    assert resp.status_code == 401
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "not_authenticated"
    assert "request_id" in data


@pytest.mark.asyncio
async def test_catalog_po_ocr_transfer_flow(client, admin_auth_header):
    # Create category
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={"name": "Clothing", "slug": "clothing", "sort_order": 0, "is_active": True},
    )
    assert cat.status_code == 201, cat.text
    category_id = cat.json()["id"]

    # Add category attribute schema
    attr = await client.post(
        f"/api/v1/categories/{category_id}/attributes",
        headers=admin_auth_header,
        json={"key": "size", "label": "Size", "type": "text", "required": True, "sort_order": 0},
    )
    assert attr.status_code == 201, attr.text

    # Create product with dynamic attributes
    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": category_id,
            "name": "T-Shirt",
            "sku": "TSHIRT-001",
            "status": "active",
            "attributes": {"size": "M"},
        },
    )
    assert prod.status_code == 201, prod.text
    product_id = prod.json()["id"]

    # Generate barcode
    bc = await client.post(f"/api/v1/products/{product_id}/barcode", headers=admin_auth_header)
    assert bc.status_code == 200, bc.text
    assert bc.json()["barcode"]

    # Create PO draft
    po = await client.post(
        "/api/v1/purchase-orders",
        headers=admin_auth_header,
        json={
            "supplier_name": "Supplier X",
            "notes": "Test",
            "lines": [{"product_id": product_id, "qty": 10, "unit_cost": 5.5}],
        },
    )
    assert po.status_code == 201, po.text
    po_id = po.json()["id"]
    assert po.json()["status"] == "draft"

    # Send PO
    sent = await client.post(f"/api/v1/purchase-orders/{po_id}/send", headers=admin_auth_header)
    assert sent.status_code == 200, sent.text
    assert sent.json()["status"] == "sent"

    # Updating after send should fail (state machine)
    upd = await client.patch(
        f"/api/v1/purchase-orders/{po_id}",
        headers=admin_auth_header,
        json={"notes": "should fail"},
    )
    assert upd.status_code == 409
    assert upd.json()["error"]["code"] == "invalid_state_transition"

    # Create invoice scan (fake provider)
    scan = await client.post(
        "/api/v1/invoice-scans",
        headers=admin_auth_header,
        json={"source_type": "qr", "data": "FAKE_QR_PAYLOAD"},
    )
    assert scan.status_code == 201, scan.text
    scan_id = scan.json()["id"]

    # Manual override to include product_id for deterministic receive
    override = await client.patch(
        f"/api/v1/invoice-scans/{scan_id}/override",
        headers=admin_auth_header,
        json={
            "override_output": {
                "supplier_name": "Supplier X",
                "invoice_number": "INV-1",
                "line_items": [{"product_id": product_id, "qty": 10, "unit_cost": 5.5}],
            }
        },
    )
    assert override.status_code == 200, override.text

    # Validate scan -> creates goods receipt and updates stock at warehouse (branch_id=1 in this test setup)
    validate = await client.post(
        f"/api/v1/invoice-scans/{scan_id}/validate",
        headers=admin_auth_header,
        json={"branch_id": 1},
    )
    assert validate.status_code == 200, validate.text
    assert validate.json()["goods_receipt_id"]
    assert validate.json()["scan"]["status"] == "validated"

    # Create transfer batch from warehouse (1) to store (2)
    batch = await client.post(
        "/api/v1/transfers",
        headers=admin_auth_header,
        json={
            "from_branch_id": 1,
            "to_branch_id": 2,
            "lines": [{"product_id": product_id, "qty": 2}],
        },
    )
    assert batch.status_code == 201, batch.text
    batch_id = batch.json()["id"]
    assert batch.json()["status"] == "pending_dispatch"

    dispatched = await client.post(
        f"/api/v1/transfers/{batch_id}/dispatch", headers=admin_auth_header
    )
    assert dispatched.status_code == 200, dispatched.text
    assert dispatched.json()["status"] == "in_transit"

    received = await client.post(f"/api/v1/transfers/{batch_id}/receive", headers=admin_auth_header)
    assert received.status_code == 200, received.text
    assert received.json()["status"] == "received"
