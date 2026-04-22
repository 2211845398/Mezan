import { useQuery } from '@tanstack/react-query';

import type { paths } from '@/api/generated/schema';

import { getTrialBalance } from './api';

export type TrialBalanceParams = paths['/api/v1/accounting/trial-balance']['get']['parameters']['query'];

export const accountingKeys = {
  all: ['accounting'] as const,
  trialBalance: (params: TrialBalanceParams) =>
    [...accountingKeys.all, 'trial-balance', params] as const,
} as const;

export function useTrialBalance(
  params: TrialBalanceParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: accountingKeys.trialBalance(params),
    queryFn: () => getTrialBalance(params),
    enabled: options?.enabled ?? true,
  });
}
