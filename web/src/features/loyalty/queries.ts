import { useQuery } from '@tanstack/react-query';

import { listLoyaltyRules } from './api';

export const loyaltyKeys = {
  all: ['loyalty'] as const,
  rules: () => [...loyaltyKeys.all, 'rules'] as const,
  ruleList: () => [...loyaltyKeys.rules(), 'list'] as const,
} as const;

export function useLoyaltyRules(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: loyaltyKeys.ruleList(),
    queryFn: listLoyaltyRules,
    enabled: options?.enabled ?? true,
  });
}
