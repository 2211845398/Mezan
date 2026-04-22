import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ListDiscountsResponse =
  paths['/api/v1/discounts']['get']['responses']['200']['content']['application/json'];

export async function listDiscountRules(): Promise<ListDiscountsResponse> {
  const { data } = await apiClient.get<ListDiscountsResponse>('/discounts');
  return data;
}
