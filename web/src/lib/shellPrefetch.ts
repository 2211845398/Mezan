import type { QueryClient } from '@tanstack/react-query';

import { queryClient } from '@/api/queryClient';
import { getBranch, listPendingOnboarding } from '@/features/admin/api';
import { adminKeys } from '@/features/admin/queries';
import type { PermissionRead, UserRead } from '@/features/auth/api';
import { authKeys } from '@/features/auth/queries';
import { leaveListQueryOptions } from '@/features/hr/queries';
import { getMyUnreadNotificationCount } from '@/features/notifications/api';
import { notificationKeys } from '@/features/notifications/queries';

const SHELL_STALE_MS = 30_000;

function hasPermission(
  permissions: ReadonlyArray<{ resource: string; action: string }>,
  resource: string,
  action: string,
): boolean {
  return permissions.some((p) => p.resource === resource && p.action === action);
}

/** Seed TanStack Query from boot/login so shell hooks do not refetch immediately. */
export function hydrateAuthQueryCache(
  qc: QueryClient,
  me: UserRead,
  perms: PermissionRead[],
): void {
  qc.setQueryData(authKeys.me(), me);
  qc.setQueryData(authKeys.myPermissions(), perms);
}

/**
 * Prefetch sidebar badge + branch queries in parallel before the admin shell mounts.
 * Call after auth identity resolves (AuthBoundary / login).
 */
export async function prefetchShellQueries(
  qc: QueryClient,
  permissions: ReadonlyArray<{ resource: string; action: string }>,
  branchId: number | null | undefined,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (hasPermission(permissions, 'employees', 'read')) {
    tasks.push(
      qc.prefetchQuery({
        ...leaveListQueryOptions({ status: 'pending', limit: 100 }),
        staleTime: SHELL_STALE_MS,
      }),
    );
  }

  if (hasPermission(permissions, 'onboarding', 'read')) {
    tasks.push(
      qc.prefetchQuery({
        queryKey: adminKeys.onboardingList(null),
        queryFn: listPendingOnboarding,
        staleTime: SHELL_STALE_MS,
      }),
    );
  }

  if (hasPermission(permissions, 'notifications', 'read')) {
    tasks.push(
      qc.prefetchQuery({
        queryKey: notificationKeys.unreadCount(),
        queryFn: async () => (await getMyUnreadNotificationCount()).unread_count,
        staleTime: SHELL_STALE_MS,
      }),
    );
  }

  if (branchId != null && branchId > 0) {
    tasks.push(
      qc.prefetchQuery({
        queryKey: adminKeys.branchDetail(branchId),
        queryFn: () => getBranch(branchId),
        staleTime: SHELL_STALE_MS,
      }),
    );
  }

  if (tasks.length === 0) return;
  await Promise.all(tasks);
}

/** Hydrate auth cache and prefetch shell endpoints (used on boot and login). */
export async function hydrateAuthAndPrefetchShell(
  me: UserRead,
  perms: PermissionRead[],
  qc: QueryClient = queryClient,
): Promise<void> {
  hydrateAuthQueryCache(qc, me, perms);
  await prefetchShellQueries(qc, perms, me.branch_id);
}
