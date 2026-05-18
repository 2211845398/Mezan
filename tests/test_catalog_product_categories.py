"""Catalog: product category tags and list filters (primary + tags + descendants)."""

from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_product_create_with_category_tags_and_filter_by_tag(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    suffix = uuid4().hex[:10]
    a = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"PrimaryCat_{suffix}",
            "slug": f"primary-cat-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert a.status_code == 201, a.text
    aid = a.json()["id"]

    b = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"TagCat_{suffix}",
            "slug": f"tag-cat-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert b.status_code == 201, b.text
    bid = b.json()["id"]

    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": aid,
            "name": f"TaggedProduct_{suffix}",
            "sku": f"SKU-TAG-{suffix}",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
            "category_ids": [bid],
        },
    )
    assert prod.status_code == 201, prod.text
    body = prod.json()
    pid = body["id"]
    assert sorted(body["category_ids"]) == sorted([aid, bid])

    got = await client.get(f"/api/v1/products/{pid}", headers=admin_auth_header)
    assert got.status_code == 200, got.text
    assert sorted(got.json()["category_ids"]) == sorted([aid, bid])

    by_tag = await client.get(
        "/api/v1/products",
        headers=admin_auth_header,
        params={"category_id": bid, "limit": 200},
    )
    assert by_tag.status_code == 200, by_tag.text
    ids = {row["id"] for row in by_tag.json()}
    assert pid in ids


@pytest.mark.asyncio
async def test_product_list_descendant_category_filter(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    suffix = uuid4().hex[:10]
    root = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"RootDesc_{suffix}",
            "slug": f"root-desc-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert root.status_code == 201, root.text
    rid = root.json()["id"]

    child = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"ChildDesc_{suffix}",
            "slug": f"child-desc-{suffix}",
            "sort_order": 0,
            "is_active": True,
            "parent_id": rid,
        },
    )
    assert child.status_code == 201, child.text
    cid = child.json()["id"]

    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cid,
            "name": f"ChildProduct_{suffix}",
            "sku": f"SKU-CH-{suffix}",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]

    no_desc = await client.get(
        "/api/v1/products",
        headers=admin_auth_header,
        params={"category_id": rid, "limit": 200},
    )
    assert no_desc.status_code == 200, no_desc.text
    assert not any(row["id"] == pid for row in no_desc.json())

    with_desc = await client.get(
        "/api/v1/products",
        headers=admin_auth_header,
        params={
            "category_id": rid,
            "category_include_descendants": True,
            "limit": 200,
        },
    )
    assert with_desc.status_code == 200, with_desc.text
    ids = {row["id"] for row in with_desc.json()}
    assert pid in ids


@pytest.mark.asyncio
async def test_category_tree_includes_image_and_direct_product_count_keys(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    resp = await client.get("/api/v1/categories/tree", headers=admin_auth_header)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0
    n = data[0]
    assert "image_url" in n
    assert "direct_product_count" in n


@pytest.mark.asyncio
async def test_product_create_without_sku_assigns_auto_sku(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    suffix = uuid4().hex[:10]
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"SkuAutoCat_{suffix}",
            "slug": f"sku-auto-{suffix}",
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
            "name": f"NoSkuProduct_{suffix}",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )
    assert prod.status_code == 201, prod.text
    sku = prod.json()["sku"]
    assert sku.startswith("PRD-")
    assert len(sku) > 4


@pytest.mark.asyncio
async def test_create_product_without_required_category_attributes_ok(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    """Master product shell: required category attrs (e.g. SIZE) are filled on variant/receipt flows."""
    suffix = uuid4().hex[:10]
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"ReqAttrCat_{suffix}",
            "slug": f"req-attr-cat-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert cat.status_code == 201, cat.text
    cid = cat.json()["id"]

    attr = await client.post(
        f"/api/v1/categories/{cid}/attributes",
        headers=admin_auth_header,
        json={
            "key": "SIZE",
            "label": "Size",
            "type": "text",
            "required": True,
            "sort_order": 0,
        },
    )
    assert attr.status_code == 201, attr.text

    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cid,
            "name": f"ShellProduct_{suffix}",
            "sku": f"SKU-SHELL-{suffix}",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )
    assert prod.status_code == 201, prod.text
    assert "SIZE" not in (prod.json().get("attributes") or {})


@pytest.mark.asyncio
async def test_product_update_empty_enum_string_treated_as_unset(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    """UI sends '' for empty Select; server must not reject with invalid enum."""
    suffix = uuid4().hex[:10]
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"EnumAttrCat_{suffix}",
            "slug": f"enum-attr-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert cat.status_code == 201, cat.text
    cid = cat.json()["id"]

    attr = await client.post(
        f"/api/v1/categories/{cid}/attributes",
        headers=admin_auth_header,
        json={
            "key": "SIZE",
            "label": "Size",
            "type": "enum",
            "required": False,
            "sort_order": 0,
            "options": {"values": ["S", "M", "L", "XL"]},
        },
    )
    assert attr.status_code == 201, attr.text

    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cid,
            "name": f"EnumProduct_{suffix}",
            "sku": f"SKU-ENUM-{suffix}",
            "status": "active",
            "attributes": {},
            "output_vat_rate": "0",
        },
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]

    upd = await client.patch(
        f"/api/v1/products/{pid}",
        headers=admin_auth_header,
        json={"attributes": {"SIZE": ""}},
    )
    assert upd.status_code == 200, upd.text
    assert "SIZE" not in (upd.json().get("attributes") or {})


@pytest.mark.asyncio
async def test_product_update_empty_enum_string_when_required_is_missing_error(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    suffix = uuid4().hex[:10]
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"ReqEnumCat_{suffix}",
            "slug": f"req-enum-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert cat.status_code == 201, cat.text
    cid = cat.json()["id"]

    attr = await client.post(
        f"/api/v1/categories/{cid}/attributes",
        headers=admin_auth_header,
        json={
            "key": "SIZE",
            "label": "Size",
            "type": "enum",
            "required": True,
            "sort_order": 0,
            "options": {"values": ["S", "M", "L", "XL"]},
        },
    )
    assert attr.status_code == 201, attr.text

    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cid,
            "name": f"ReqEnumProd_{suffix}",
            "sku": f"SKU-REN-{suffix}",
            "status": "active",
            "attributes": {"SIZE": "M"},
            "output_vat_rate": "0",
        },
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]

    bad = await client.patch(
        f"/api/v1/products/{pid}",
        headers=admin_auth_header,
        json={"attributes": {"SIZE": ""}},
    )
    assert bad.status_code == 422, bad.text
    err = bad.json()["error"]
    assert err["code"] == "validation_error"
    assert "SIZE" in err["details"]["missing_keys"]


@pytest.mark.asyncio
async def test_product_image_upload_returns_static_url(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    img = b"\xff\xd8\xff\xd9"
    resp = await client.post(
        "/api/v1/products/images",
        headers=admin_auth_header,
        files={"file": ("x.jpg", img, "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    assert "/api/v1/static/catalog-product-images/" in resp.json()["image_url"]
