"""Realtime SSE and nav badge invalidation."""

import asyncio
import json

import pytest
from sqlalchemy import select

from app.models.users import User
from app.services.realtime_broadcast_service import RealtimeBroadcaster
from app.utils.security import create_access_token

pytestmark = pytest.mark.security


@pytest.mark.anyio
async def test_sse_requires_access_token(client):
    res = await client.get("/api/v1/realtime/events")
    assert res.status_code == 422


@pytest.mark.anyio
async def test_sse_rejects_invalid_token(client):
    res = await client.get("/api/v1/realtime/events", params={"access_token": "not-a-valid-jwt"})
    assert res.status_code == 401


@pytest.mark.anyio
async def test_realtime_broadcaster_filters_by_permission():
    broadcaster = RealtimeBroadcaster()
    hr_sub = await broadcaster.subscribe(
        user_id=1,
        permissions={("employees", "read")},
    )
    inv_sub = await broadcaster.subscribe(
        user_id=2,
        permissions={("inventory", "read")},
    )

    await broadcaster.emit_nav_badges_invalidate(
        kinds=["leave_pending", "reorder_alerts"],
        any_permissions=(("employees", "read"), ("inventory", "read")),
    )

    hr_payload = await asyncio.wait_for(hr_sub.queue.get(), timeout=1)
    inv_payload = await asyncio.wait_for(inv_sub.queue.get(), timeout=1)

    hr_event = json.loads(hr_payload)
    inv_event = json.loads(inv_payload)
    assert hr_event["event"] == "nav_badges_invalidate"
    assert "leave_pending" in hr_event["kinds"]
    assert "reorder_alerts" not in hr_event["kinds"]
    assert "reorder_alerts" in inv_event["kinds"]
    assert "leave_pending" not in inv_event["kinds"]

    await broadcaster.unsubscribe(hr_sub)
    await broadcaster.unsubscribe(inv_sub)


@pytest.mark.anyio
async def test_sse_streams_connected_event(client, admin_auth_header, db_session):
    result = await db_session.execute(select(User).where(User.email == "admin@example.com"))
    admin = result.scalar_one()
    token = create_access_token(admin.id)

    async with client.stream(
        "GET",
        "/api/v1/realtime/events",
        params={"access_token": token},
        timeout=5,
    ) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")
        first_line = ""
        async for chunk in response.aiter_text():
            first_line += chunk
            if "\n\n" in first_line:
                break
        assert "connected" in first_line
