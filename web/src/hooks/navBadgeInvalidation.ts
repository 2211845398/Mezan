import type { QueryClient } from '@tanstack/react-query';

import { adminKeys } from '@/features/admin/queries';
import { hrKeys } from '@/features/hr/queries';
import { notificationKeys } from '@/features/notifications/queries';
import type { NavBadgeKind } from '@/config/navigation';

export const NAV_BADGE_POLL_MS = 60_000;

const REORDER_ALERTS_QUERY_KEY = ['nav-badge', 'reorder-alerts'] as const;
const COMMERCIAL_RESTOCK_QUERY_KEY = ['nav-badge', 'commercial-restock'] as const;

export function reorderAlertsBadgeQueryKey() {
  return REORDER_ALERTS_QUERY_KEY;
}

export function commercialRestockBadgeQueryKey() {
  return COMMERCIAL_RESTOCK_QUERY_KEY;
}

/**
 * Map SSE `kinds` to React Query keys that feed `useNavBadges()`.
 */
export function invalidateNavBadgeKinds(queryClient: QueryClient, kinds: NavBadgeKind[]): void {
  const unique = new Set(kinds);
  for (const kind of unique) {
    switch (kind) {
      case 'leave_pending':
      case 'hr_attention_rollup':
        void queryClient.invalidateQueries({
          queryKey: hrKeys.leaveList({ status: 'pending', limit: 100 }),
        });
        break;
      case 'onboarding_pending':
        void queryClient.invalidateQueries({ queryKey: adminKeys.onboardingList(null) });
        break;
      case 'notifications_unread':
        void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
        break;
      case 'reorder_alerts':
        void queryClient.invalidateQueries({ queryKey: REORDER_ALERTS_QUERY_KEY });
        break;
      case 'commercial_restock':
        void queryClient.invalidateQueries({ queryKey: COMMERCIAL_RESTOCK_QUERY_KEY });
        break;
      default:
        break;
    }
  }
  if (unique.has('hr_attention_rollup')) {
    void queryClient.invalidateQueries({ queryKey: adminKeys.onboardingList(null) });
  }
}

export function isNavBadgeKind(value: string): value is NavBadgeKind {
  return (
    value === 'leave_pending' ||
    value === 'onboarding_pending' ||
    value === 'notifications_unread' ||
    value === 'hr_attention_rollup' ||
    value === 'reorder_alerts' ||
    value === 'commercial_restock'
  );
}
