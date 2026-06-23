"""Convenience emitters for sidebar nav badge invalidation."""

from __future__ import annotations

from app.services.realtime_broadcast_service import realtime_broadcaster


async def emit_leave_nav_badges_invalidate() -> None:
    await realtime_broadcaster.emit_nav_badges_invalidate(
        kinds=["leave_pending", "hr_attention_rollup"],
        permission=("employees", "read"),
    )


async def emit_onboarding_nav_badges_invalidate() -> None:
    await realtime_broadcaster.emit_nav_badges_invalidate(
        kinds=["onboarding_pending", "hr_attention_rollup"],
        any_permissions=(("onboarding", "read"), ("employees", "read")),
    )


async def emit_notifications_unread_for_user(user_id: int) -> None:
    await realtime_broadcaster.emit_nav_badges_invalidate(
        kinds=["notifications_unread"],
        user_ids={user_id},
    )


async def emit_reorder_alerts_invalidate() -> None:
    await realtime_broadcaster.emit_nav_badges_invalidate(
        kinds=["reorder_alerts"],
        any_permissions=(("inventory", "read"), ("purchase_orders", "read")),
    )


async def emit_commercial_restock_invalidate() -> None:
    await realtime_broadcaster.emit_nav_badges_invalidate(
        kinds=["commercial_restock"],
        permission=("inventory", "read"),
    )


async def emit_inventory_stock_badges_invalidate() -> None:
    await realtime_broadcaster.emit_nav_badges_invalidate(
        kinds=["reorder_alerts", "commercial_restock"],
        any_permissions=(("inventory", "read"), ("purchase_orders", "read")),
    )
