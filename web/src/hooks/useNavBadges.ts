import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { listPendingOnboarding } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { getCommercialRestockCount, getReorderAlertCount } from '@/features/inventory/api';
import { getMyUnreadNotificationCount } from '@/features/notifications/api';

import type { NavBadgeKind } from '@/config/navigation';
import { leaveListQueryOptions } from '@/features/hr/queries';
import { notificationKeys } from '@/features/notifications/queries';

import {
  commercialRestockBadgeQueryKey,
  NAV_BADGE_POLL_MS,
  reorderAlertsBadgeQueryKey,
} from './navBadgeInvalidation';
import { usePermission } from './usePermission';

const STALE_MS = 30_000;

export type NavBadgeCounts = Record<NavBadgeKind, number>;

/**
 * Attention counts for sidebar badges (pending leave, onboarding, unread inbox, HR rollup).
 * Queries stay disabled when the user lacks the relevant permission.
 */
export function useNavBadges(): NavBadgeCounts {
  const canEmployeesRead = usePermission('employees', 'read');
  const canOnboardingRead = usePermission('onboarding', 'read');
  const canNotificationsRead = usePermission('notifications', 'read');
  const canInventoryRead = usePermission('inventory', 'read');
  const canPurchaseOrdersRead = usePermission('purchase_orders', 'read');
  const canReorderAlerts = canInventoryRead || canPurchaseOrdersRead;

  const [pendingLeave, pendingOnboarding, unread, reorderAlerts, commercialRestock] = useQueries({
    queries: [
      {
        ...leaveListQueryOptions({ status: 'pending', limit: 100 }),
        enabled: canEmployeesRead,
        staleTime: STALE_MS,
        refetchInterval: NAV_BADGE_POLL_MS,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: adminKeys.onboardingList(null),
        queryFn: listPendingOnboarding,
        enabled: canOnboardingRead,
        staleTime: STALE_MS,
        refetchInterval: NAV_BADGE_POLL_MS,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: notificationKeys.unreadCount(),
        queryFn: async () => (await getMyUnreadNotificationCount()).unread_count,
        enabled: canNotificationsRead,
        staleTime: STALE_MS,
        refetchInterval: NAV_BADGE_POLL_MS,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: reorderAlertsBadgeQueryKey(),
        queryFn: async () => (await getReorderAlertCount()).count,
        enabled: canReorderAlerts,
        staleTime: STALE_MS,
        refetchInterval: NAV_BADGE_POLL_MS,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: commercialRestockBadgeQueryKey(),
        queryFn: async () => (await getCommercialRestockCount()).count,
        enabled: canInventoryRead,
        staleTime: STALE_MS,
        refetchInterval: NAV_BADGE_POLL_MS,
        refetchOnWindowFocus: true,
      },
    ],
  });

  return useMemo(() => {
    const leaveN = canEmployeesRead ? (pendingLeave.data?.length ?? 0) : 0;
    const onboardN = canOnboardingRead ? (pendingOnboarding.data?.length ?? 0) : 0;
    const unreadN = canNotificationsRead ? (unread.data ?? 0) : 0;
    const reorderN = canReorderAlerts ? (reorderAlerts.data ?? 0) : 0;
    const commercialN = canInventoryRead ? (commercialRestock.data ?? 0) : 0;
    const hrRollup = leaveN + onboardN;

    return {
      leave_pending: leaveN,
      onboarding_pending: onboardN,
      notifications_unread: unreadN,
      hr_attention_rollup: hrRollup,
      reorder_alerts: reorderN,
      commercial_restock: commercialN,
    };
  }, [
    canEmployeesRead,
    canOnboardingRead,
    canNotificationsRead,
    canReorderAlerts,
    canInventoryRead,
    pendingLeave.data,
    pendingOnboarding.data,
    unread.data,
    reorderAlerts.data,
    commercialRestock.data,
  ]);
}

export function navBadgeCount(badges: NavBadgeCounts, kind: NavBadgeKind | undefined): number {
  if (!kind) return 0;
  return badges[kind] ?? 0;
}
