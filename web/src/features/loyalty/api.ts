import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ListLoyaltyRulesResponse =
  paths['/api/v1/loyalty/rules']['get']['responses']['200']['content']['application/json'];

export async function listLoyaltyRules(): Promise<ListLoyaltyRulesResponse> {
  const { data } = await apiClient.get<ListLoyaltyRulesResponse>('/loyalty/rules');
  return data;
}
