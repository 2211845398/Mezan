import { useQuery } from '@tanstack/react-query';

import { getExecutiveKpis } from './api';

export const biKeys = {
  all: ['bi'] as const,
  executiveKpis: () => [...biKeys.all, 'executive-kpis'] as const,
} as const;

export function useExecutiveKpis(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: biKeys.executiveKpis(),
    queryFn: getExecutiveKpis,
    enabled: options?.enabled ?? true,
  });
}
