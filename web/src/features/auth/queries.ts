import { useQuery } from '@tanstack/react-query';

import { getMe, getMyBranch, getMyPermissions, type PermissionRead, type UserRead } from './api';
import { useAuthStore } from './stores/authStore';

/*
 * Central query-key factory for auth. Every `api.ts` module across features
 * exports its keys through a small factory like this — no magic strings in
 * components.
 */

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
  myBranch: () => [...authKeys.all, 'me', 'branch'] as const,
  myPermissions: () => [...authKeys.all, 'me', 'permissions'] as const,
};

export function useMe(options?: { enabled?: boolean }) {
  const status = useAuthStore((s) => s.status);
  return useQuery<UserRead>({
    queryKey: authKeys.me(),
    queryFn: getMe,
    enabled: (options?.enabled ?? true) && status === 'authenticated',
    staleTime: 60_000,
  });
}

export function useMyBranch(options?: { enabled?: boolean }) {
  const status = useAuthStore((s) => s.status);
  const branchId = useAuthStore((s) => s.user?.branch_id ?? s.activeBranchId);
  return useQuery({
    queryKey: authKeys.myBranch(),
    queryFn: getMyBranch,
    enabled: (options?.enabled ?? true) && status === 'authenticated' && branchId != null,
    staleTime: 300_000,
    retry: false,
  });
}

export function useMyPermissions(options?: { enabled?: boolean }) {
  const status = useAuthStore((s) => s.status);
  return useQuery<PermissionRead[]>({
    queryKey: authKeys.myPermissions(),
    queryFn: getMyPermissions,
    enabled: (options?.enabled ?? true) && status === 'authenticated',
    staleTime: 60_000,
  });
}
