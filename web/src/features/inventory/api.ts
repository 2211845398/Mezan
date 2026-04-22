import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ListMovementsParams = NonNullable<
  paths['/api/v1/inventory/movements']['get']['parameters']['query']
>;
type ListMovementsResponse =
  paths['/api/v1/inventory/movements']['get']['responses']['200']['content']['application/json'];

export async function listStockMovements(
  params?: ListMovementsParams,
): Promise<ListMovementsResponse> {
  const { data } = await apiClient.get<ListMovementsResponse>('/inventory/movements', {
    params,
  });
  return data;
}
