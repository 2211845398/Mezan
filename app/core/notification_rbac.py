"""Role gates for org-wide notification admin actions (broadcast, history, all-users routines).

Company-wide audience = all active users with no branch filter and no role filter.
"""

from __future__ import annotations

from app.models.notifications import NotificationSchedule
from app.schemas.notifications import NotificationScheduleUpsert

# Roles allowed to broadcast, view org notification history, and define company-wide routines.
ORG_NOTIFICATION_MANAGER_ROLE_CODES: frozenset[str] = frozenset({"OWNER", "ADMIN", "IT_ADMIN"})


def is_company_wide_audience(body: NotificationScheduleUpsert) -> bool:
    """True when the routine targets every active user (no branch or role restriction)."""
    return body.target_role_code is None and body.branch_id is None


def is_company_wide_schedule(row: NotificationSchedule) -> bool:
    """Org-wide routine: no branch/role filter and not owned by a single user."""
    return row.owner_user_id is None and row.target_role_code is None and row.branch_id is None
