"""Server-Sent Events stream for in-app realtime invalidation."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import user_from_access_token
from app.db.database import get_db
from app.services.effective_permissions import load_user_effective_permissions
from app.services.realtime_broadcast_service import realtime_broadcaster

router = APIRouter()

_HEARTBEAT_SECONDS = 30


async def _event_stream(
    *,
    user_id: int,
    permissions: set[tuple[str, str]],
) -> AsyncIterator[str]:
    sub = await realtime_broadcaster.subscribe(user_id=user_id, permissions=permissions)
    try:
        yield f"data: {json.dumps({'event': 'connected', 'ts': None})}\n\n"
        while True:
            try:
                payload = await asyncio.wait_for(sub.queue.get(), timeout=_HEARTBEAT_SECONDS)
                yield f"data: {payload}\n\n"
            except TimeoutError:
                yield ": ping\n\n"
    finally:
        await realtime_broadcaster.unsubscribe(sub)


@router.get("/realtime/events")
async def realtime_events(
    access_token: str = Query(..., min_length=8),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Authenticated SSE stream (JWT via query param; see PUBLIC_ROUTE_ALLOWLIST in main)."""
    user = await user_from_access_token(db, access_token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    permissions = await load_user_effective_permissions(db, user.id)
    generator = _event_stream(user_id=user.id, permissions=permissions)
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
