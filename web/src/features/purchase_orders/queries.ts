import { useQuery } from '@tanstack/react-query';

import type { paths } from '@/api/generated/schema';

import { listPurchaseOrders } from './api';

export type ListPurchaseOrdersParams = NonNullable<
  paths['/api/v1/purchase-orders']['get']['parameters']['query']
>;

export const purchaseOrderKeys = {
  all: ['purchase-orders'] as const,
  lists: () => [...purchaseOrderKeys.all, 'list'] as const,
  list: (params: ListPurchaseOrdersParams | undefined) =>
    [...purchaseOrderKeys.lists(), params] as const,
} as const;

export function usePurchaseOrders(
  params?: ListPurchaseOrdersParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: purchaseOrderKeys.list(params),
    queryFn: () => listPurchaseOrders(params),
    enabled: options?.enabled ?? true,
  });
}
