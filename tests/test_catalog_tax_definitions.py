"""Catalog tax definitions and product tax links (effective output VAT)."""

from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_tax_definitions_crud_and_product_effective_rate(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    suffix = uuid4().hex[:10]

    t1 = await client.post(
        "/api/v1/tax-definitions",
        headers=admin_auth_header,
        json={"name": f"VAT_{suffix}", "code": f"vat-{suffix}", "rate": "0.10", "is_active": True},
    )
    assert t1.status_code == 201, t1.text
    tid1 = t1.json()["id"]

    t2 = await client.post(
        "/api/v1/tax-definitions",
        headers=admin_auth_header,
        json={"name": f"Levy_{suffix}", "code": None, "rate": "0.05", "is_active": True},
    )
    assert t2.status_code == 201, t2.text
    tid2 = t2.json()["id"]

    listed = await client.get("/api/v1/tax-definitions", headers=admin_auth_header)
    assert listed.status_code == 200, listed.text
    assert any(r["id"] == tid1 for r in listed.json())

    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"TaxCat_{suffix}",
            "slug": f"tax-cat-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert cat.status_code == 201, cat.text
    cid = cat.json()["id"]

    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cid,
            "name": f"TaxProduct_{suffix}",
            "sku": f"SKU-TX-{suffix}",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0.99",
            "tax_definition_ids": [tid1, tid2],
        },
    )
    assert prod.status_code == 201, prod.text
    body = prod.json()
    pid = body["id"]
    assert sorted(body["tax_definition_ids"]) == sorted([tid1, tid2])
    assert body["output_vat_rate"] == "0.15"

    got = await client.get(f"/api/v1/products/{pid}", headers=admin_auth_header)
    assert got.status_code == 200, got.text
    assert got.json()["output_vat_rate"] == "0.15"

    arch = await client.delete(f"/api/v1/tax-definitions/{tid2}", headers=admin_auth_header)
    assert arch.status_code == 200, arch.text

    got2 = await client.get(f"/api/v1/products/{pid}", headers=admin_auth_header)
    assert got2.status_code == 200, got2.text
    assert got2.json()["output_vat_rate"] == "0.10"
