import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { listPendingOnboarding } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import { getMyUnreadNotificationCount } from '@/features/notifications/api';

import type { NavBadgeKind } from '@/config/navigation';
import { leaveListQueryOptions } from '@/features/hr/queries';
import { notificationKeys } from '@/features/notifications/queries';

import { usePermission } from './usePermission';

const STALE_MS = 30_000;
const POLL_MS = 120_000;

export type NavBadgeCounts = Record<NavBadgeKind, number>;

/**
 * Attention counts for sidebar badges (pending leave, onboarding, unread inbox, HR rollup).
 * Queries stay disabled when the user lacks the relevant permission.
 */
export function useNavBadges(): NavBadgeCounts {
  const canEmployeesRead = usePermission('employees', 'read');
  const canOnboardingRead = usePermission('onboarding', 'read');
  const canNotificationsRead = usePermission('notifications', 'read');

  const [pendingLeave, pendingOnboarding, unread] = useQueries({
    queries: [
      {
        ...leaveListQueryOptions({ status: 'pending', limit: 100 }),
        enabled: canEmployeesRead,
        staleTime: STALE_MS,
        refetchInterval: POLL_MS,
      },
      {
        queryKey: adminKeys.onboardingList(null),
        queryFn: listPendingOnboarding,
        enabled: canOnboardingRead,
        staleTime: STALE_MS,
        refetchInterval: POLL_MS,
      },
      {
        queryKey: notificationKeys.unreadCount(),
        queryFn: async () => (await getMyUnreadNotificationCount()).unread_count,
        enabled: canNotificationsRead,
        staleTime: STALE_MS,
        refetchInterval: POLL_MS,
      },
    ],
  });

  return useMemo(() => {
    const leaveN = canEmployeesRead ? (pendingLeave.data?.length ?? 0) : 0;
    const onboardN = canOnboardingRead ? (pendingOnboarding.data?.length ?? 0) : 0;
    const unreadN = canNotificationsRead ? (unread.data ?? 0) : 0;
    const hrRollup = leaveN + onboardN;

    return {
      leave_pending: leaveN,
      onboarding_pending: onboardN,
      notifications_unread: unreadN,
      hr_attention_rollup: hrRollup,
    };
  }, [
    canEmployeesRead,
    canOnboardingRead,
    canNotificationsRead,
    pendingLeave.data,
    pendingOnboarding.data,
    unread.data,
  ]);
}

export function navBadgeCount(badges: NavBadgeCounts, kind: NavBadgeKind | undefined): number {
  if (!kind) return 0;
  return badges[kind] ?? 0;
}
