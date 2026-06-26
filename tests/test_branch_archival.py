"""Regression tests for soft-deleted (archived) branches."""

import uuid

import pytest


@pytest.mark.asyncio
async def test_archived_branch_hidden_from_list_and_blocks_terminal(client, admin_auth_header):
    code = f"AR{uuid.uuid4().hex[:8].upper()}"
    create = await client.post(
        "/api/v1/branches",
        headers=admin_auth_header,
        json={
            "name": "Archive me",
            "code": code,
            "address": None,
            "timezone": "UTC",
            "kind": "commercial",
        },
    )
    assert create.status_code == 200, create.text
    branch_id = create.json()["id"]
    assert create.json().get("archived_at") in (None,)

    listed = await client.get("/api/v1/branches", headers=admin_auth_header)
    assert listed.status_code == 200, listed.text
    assert any(b["id"] == branch_id for b in listed.json())

    del_res = await client.delete(f"/api/v1/branches/{branch_id}", headers=admin_auth_header)
    assert del_res.status_code == 204, del_res.text

    listed2 = await client.get("/api/v1/branches", headers=admin_auth_header)
    assert listed2.status_code == 200, listed2.text
    assert not any(b["id"] == branch_id for b in listed2.json())

    listed_all = await client.get(
        "/api/v1/branches", headers=admin_auth_header, params={"include_archived": "true"}
    )
    assert listed_all.status_code == 200, listed_all.text
    archived_row = next(b for b in listed_all.json() if b["id"] == branch_id)
    assert archived_row["archived_at"] is not None

    term = await client.post(
        "/api/v1/terminals",
        headers=admin_auth_header,
        json={
            "branch_id": branch_id,
            "name": "Should fail",
            "terminal_code": f"T-{uuid.uuid4().hex[:8]}",
        },
    )
    assert term.status_code == 422, term.text
    assert term.json()["error"]["code"] == "validation_error"

    del_again = await client.delete(f"/api/v1/branches/{branch_id}", headers=admin_auth_header)
    assert del_again.status_code == 204, del_again.text
