import pytest


@pytest.mark.anyio
async def test_manual_broadcast_creates_unread_in_app_notification(client, admin_auth_header):
    response = await client.post(
        "/api/v1/admin/notifications/broadcast",
        headers=admin_auth_header,
        json={
            "title": "Daily reminder",
            "body": "Please review your tasks.",
            "target_type": "all",
            "role_code": None,
            "branch_id": None,
            "data": {},
        },
    )
    assert response.status_code == 202
    assert response.json()["deliveries_created"] >= 1

    unread = await client.get(
        "/api/v1/notifications/deliveries/me/unread-count",
        headers=admin_auth_header,
    )
    assert unread.status_code == 200
    assert unread.json()["unread_count"] >= 1

    mark_all = await client.post(
        "/api/v1/notifications/deliveries/me/read-all",
        headers=admin_auth_header,
    )
    assert mark_all.status_code == 200
    assert mark_all.json()["updated"] >= 1
