"""Tests for GET /api/v1/auth/me/permissions (added for Epic W-2)."""

from httpx import AsyncClient


async def test_me_permissions_returns_effective_permissions_for_authenticated_user(
    client: AsyncClient, admin_auth_header: dict[str, str]
) -> None:
    response = await client.get("/api/v1/auth/me/permissions", headers=admin_auth_header)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) > 0, "Admin role must have at least one seeded permission"
    # Every entry must carry the contract the web guard depends on.
    for item in payload:
        assert set(item.keys()) == {"resource", "action"}
        assert isinstance(item["resource"], str) and item["resource"]
        assert isinstance(item["action"], str) and item["action"]

    # Admin should be able to read accounting (seeded in seed_permissions_and_roles).
    pairs = {(p["resource"], p["action"]) for p in payload}
    assert ("accounting", "read") in pairs

    # The list is sorted (contract for stable client diffing).
    serialized = [(p["resource"], p["action"]) for p in payload]
    assert serialized == sorted(serialized)


async def test_me_permissions_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me/permissions")

    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "not_authenticated"
