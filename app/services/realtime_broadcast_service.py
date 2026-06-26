"""In-process SSE fan-out for nav badge invalidation signals."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import UTC, datetime

NAV_BADGE_KIND_PERMISSIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "leave_pending": (("employees", "read"),),
    "onboarding_pending": (("onboarding", "read"),),
    "notifications_unread": (("notifications", "read"),),
    "hr_attention_rollup": (("employees", "read"), ("onboarding", "read")),
    "reorder_alerts": (("inventory", "read"), ("purchase_orders", "read")),
    "commercial_restock": (("inventory", "read"),),
}


@dataclass
class RealtimeSubscriber:
    user_id: int
    permissions: frozenset[tuple[str, str]]
    queue: asyncio.Queue[str]


class RealtimeBroadcaster:
    """Fan-out hub scoped to a single API process (see PROJECT_STATE W-RT-Badges)."""

    def __init__(self) -> None:
        self._subscribers: list[RealtimeSubscriber] = []
        self._lock = asyncio.Lock()

    async def subscribe(
        self,
        *,
        user_id: int,
        permissions: set[tuple[str, str]],
    ) -> RealtimeSubscriber:
        sub = RealtimeSubscriber(
            user_id=user_id,
            permissions=frozenset(permissions),
            queue=asyncio.Queue(maxsize=64),
        )
        async with self._lock:
            self._subscribers.append(sub)
        return sub

    async def unsubscribe(self, sub: RealtimeSubscriber) -> None:
        async with self._lock:
            try:
                self._subscribers.remove(sub)
            except ValueError:
                pass

    def _kinds_for_subscriber(self, sub: RealtimeSubscriber, kinds: list[str]) -> list[str]:
        accepted: list[str] = []
        for kind in kinds:
            required = NAV_BADGE_KIND_PERMISSIONS.get(kind)
            if required is None:
                continue
            if any(perm in sub.permissions for perm in required):
                accepted.append(kind)
        return accepted

    def _matches_audience(
        self,
        sub: RealtimeSubscriber,
        *,
        user_ids: frozenset[int] | None,
        permission: tuple[str, str] | None,
        any_permissions: tuple[tuple[str, str], ...] | None,
    ) -> bool:
        if user_ids is not None:
            return sub.user_id in user_ids
        if permission is not None:
            return permission in sub.permissions
        if any_permissions is not None:
            return any(perm in sub.permissions for perm in any_permissions)
        return True

    async def emit_nav_badges_invalidate(
        self,
        *,
        kinds: list[str],
        user_ids: set[int] | None = None,
        permission: tuple[str, str] | None = None,
        any_permissions: tuple[tuple[str, str], ...] | None = None,
    ) -> None:
        filtered_kinds = [k for k in kinds if k in NAV_BADGE_KIND_PERMISSIONS]
        if not filtered_kinds:
            return
        if user_ids is None and permission is None and any_permissions is None:
            return

        audience_user_ids = frozenset(user_ids) if user_ids is not None else None

        async with self._lock:
            targets = list(self._subscribers)

        for sub in targets:
            if not self._matches_audience(
                sub,
                user_ids=audience_user_ids,
                permission=permission,
                any_permissions=any_permissions,
            ):
                continue
            accepted = self._kinds_for_subscriber(sub, filtered_kinds)
            if not accepted:
                continue
            event_payload = json.dumps(
                {
                    "event": "nav_badges_invalidate",
                    "kinds": accepted,
                    "ts": datetime.now(UTC).isoformat(),
                }
            )
            try:
                sub.queue.put_nowait(event_payload)
            except asyncio.QueueFull:
                pass


realtime_broadcaster = RealtimeBroadcaster()
