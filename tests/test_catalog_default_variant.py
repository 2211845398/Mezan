"""New products get a default ProductVariant (stock-keeping row)."""

from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_product_creates_default_variant(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    suffix = uuid4().hex[:10]
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"VarCat_{suffix}",
            "slug": f"var-cat-{suffix}",
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
            "name": f"DefaultVarProduct_{suffix}",
            "status": "active",
        },
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]

    detail = await client.get(
        f"/api/v1/products/{pid}/with-variants",
        headers=admin_auth_header,
    )
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body.get("variant_count", 0) >= 1
    variants = body.get("variants") or []
    assert len(variants) >= 1
    v0 = variants[0]
    assert v0.get("id") is not None
    assert v0.get("sku") == prod.json().get("sku")
