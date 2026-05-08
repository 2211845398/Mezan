"""Category dynamic attribute inheritance (propagation + merged product validation)."""

import pytest


@pytest.mark.asyncio
async def test_attribute_propagates_to_descendants_and_lists_inherited(client, admin_auth_header):
    p = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={"name": "ParentCat", "slug": "parent-cat-inh", "sort_order": 0, "is_active": True},
    )
    assert p.status_code == 201, p.text
    parent_id = p.json()["id"]

    c = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": "ChildCat",
            "slug": "child-cat-inh",
            "sort_order": 0,
            "is_active": True,
            "parent_id": parent_id,
        },
    )
    assert c.status_code == 201, c.text
    child_id = c.json()["id"]

    attr = await client.post(
        f"/api/v1/categories/{parent_id}/attributes",
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
    assert attr.json().get("inherited_from_category_id") in (None,)

    r = await client.get(
        f"/api/v1/categories/{child_id}/attributes",
        headers=admin_auth_header,
        params={"include_inherited": "true"},
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    size_rows = [x for x in rows if x["key"] == "SIZE"]
    assert len(size_rows) == 1
    row = size_rows[0]
    assert row["is_inherited"] is True
    assert row["inherited_from_category_id"] == parent_id
    assert row["required"] is False

    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": child_id,
            "name": "InheritedAttrProduct",
            "sku": "inh-prod-1",
            "status": "active",
            "sell_price": "12.50",
            "attributes": {"SIZE": "L"},
        },
    )
    assert prod.status_code == 201, prod.text


@pytest.mark.asyncio
async def test_delete_parent_attribute_removes_propagated_copies(client, admin_auth_header):
    p = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={"name": "ParentDel", "slug": "parent-del-inh", "sort_order": 0, "is_active": True},
    )
    assert p.status_code == 201, p.text
    parent_id = p.json()["id"]

    c = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": "ChildDel",
            "slug": "child-del-inh",
            "sort_order": 0,
            "is_active": True,
            "parent_id": parent_id,
        },
    )
    assert c.status_code == 201, c.text
    child_id = c.json()["id"]

    attr = await client.post(
        f"/api/v1/categories/{parent_id}/attributes",
        headers=admin_auth_header,
        json={"key": "COLOR", "label": "Color", "type": "text", "required": False, "sort_order": 0},
    )
    assert attr.status_code == 201, attr.text
    attr_id = attr.json()["id"]

    r1 = await client.get(f"/api/v1/categories/{child_id}/attributes", headers=admin_auth_header)
    assert r1.status_code == 200
    assert any(x["key"] == "COLOR" for x in r1.json())

    d = await client.delete(
        f"/api/v1/categories/{parent_id}/attributes/{attr_id}",
        headers=admin_auth_header,
    )
    assert d.status_code == 204, d.text

    r2 = await client.get(f"/api/v1/categories/{child_id}/attributes", headers=admin_auth_header)
    assert r2.status_code == 200
    assert not any(x["key"] == "COLOR" for x in r2.json())


@pytest.mark.asyncio
async def test_virtual_inherited_attribute_visible_when_include_inherited(client, admin_auth_header, db_session):
    """Child has no local row; parent has an attribute — list with include_inherited exposes it."""
    from app.models.category_attribute_def import CategoryAttributeDef

    p = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={"name": "VirtParent", "slug": "virt-parent-inh", "sort_order": 0, "is_active": True},
    )
    assert p.status_code == 201, p.text
    parent_id = p.json()["id"]

    c = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": "VirtChild",
            "slug": "virt-child-inh",
            "sort_order": 0,
            "is_active": True,
            "parent_id": parent_id,
        },
    )
    assert c.status_code == 201, c.text
    child_id = c.json()["id"]

    db_session.add(
        CategoryAttributeDef(
            category_id=parent_id,
            inherited_from_category_id=None,
            key="LEGACY_KEY",
            label="Legacy",
            type="text",
            required=False,
            sort_order=0,
        )
    )
    await db_session.commit()

    r_all = await client.get(
        f"/api/v1/categories/{child_id}/attributes",
        headers=admin_auth_header,
        params={"include_inherited": "true"},
    )
    assert r_all.status_code == 200
    body = r_all.json()
    keys = {x["key"] for x in body}
    assert "LEGACY_KEY" in keys
    leg = next(x for x in body if x["key"] == "LEGACY_KEY")
    assert leg["is_inherited"] is True

    r_local = await client.get(
        f"/api/v1/categories/{child_id}/attributes",
        headers=admin_auth_header,
        params={"include_inherited": "false"},
    )
    assert r_local.status_code == 200
    assert not any(x["key"] == "LEGACY_KEY" for x in r_local.json())
