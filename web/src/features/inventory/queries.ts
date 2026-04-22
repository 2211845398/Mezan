import { useQuery } from '@tanstack/react-query';

import type { paths } from '@/api/generated/schema';

import { listStockMovements } from './api';

export type ListStockMovementsParams = NonNullable<
  paths['/api/v1/inventory/movements']['get']['parameters']['query']
>;

export const inventoryKeys = {
  all: ['inventory'] as const,
  movements: () => [...inventoryKeys.all, 'movements'] as const,
  movementList: (params: ListStockMovementsParams | undefined) =>
    [...inventoryKeys.movements(), params] as const,
} as const;

export function useStockMovements(
  params?: ListStockMovementsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: inventoryKeys.movementList(params),
    queryFn: () => listStockMovements(params),
    enabled: options?.enabled ?? true,
  });
}
