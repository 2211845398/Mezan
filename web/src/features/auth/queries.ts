import { useQuery } from '@tanstack/react-query';

import { getMe, getMyPermissions, type PermissionRead, type UserRead } from './api';
import { useAuthStore } from './stores/authStore';

/*
 * Central query-key factory for auth. Every `api.ts` module across features
 * exports its keys through a small factory like this — no magic strings in
 * components.
 */

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
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

export function useMyPermissions(options?: { enabled?: boolean }) {
  const status = useAuthStore((s) => s.status);
  return useQuery<PermissionRead[]>({
    queryKey: authKeys.myPermissions(),
    queryFn: getMyPermissions,
    enabled: (options?.enabled ?? true) && status === 'authenticated',
    staleTime: 60_000,
  });
}
