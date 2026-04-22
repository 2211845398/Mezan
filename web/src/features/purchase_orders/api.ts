import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ListPurchaseOrdersParams = NonNullable<
  paths['/api/v1/purchase-orders']['get']['parameters']['query']
>;
type ListPurchaseOrdersResponse =
  paths['/api/v1/purchase-orders']['get']['responses']['200']['content']['application/json'];

export async function listPurchaseOrders(
  params?: ListPurchaseOrdersParams,
): Promise<ListPurchaseOrdersResponse> {
  const { data } = await apiClient.get<ListPurchaseOrdersResponse>('/purchase-orders', {
    params,
  });
  return data;
}
