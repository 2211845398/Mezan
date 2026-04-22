import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type TrialBalanceParams = paths['/api/v1/accounting/trial-balance']['get']['parameters']['query'];
type TrialBalanceResponse =
  paths['/api/v1/accounting/trial-balance']['get']['responses']['200']['content']['application/json'];

export async function getTrialBalance(params: TrialBalanceParams): Promise<TrialBalanceResponse> {
  const { data } = await apiClient.get<TrialBalanceResponse>('/accounting/trial-balance', {
    params,
  });
  return data;
}
