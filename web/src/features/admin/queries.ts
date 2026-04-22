import { useQuery } from '@tanstack/react-query';

import { getConfig, listUsers } from './api';

export const adminKeys = {
  all: ['admin'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  userList: () => [...adminKeys.users(), 'list'] as const,
  config: () => [...adminKeys.all, 'config'] as const,
} as const;

export function useUsers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.userList(),
    queryFn: listUsers,
    enabled: options?.enabled ?? true,
  });
}

export function useAppConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.config(),
    queryFn: getConfig,
    enabled: options?.enabled ?? true,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
