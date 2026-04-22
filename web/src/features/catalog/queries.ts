import { useQuery } from '@tanstack/react-query';

import type { paths } from '@/api/generated/schema';

import { listProducts } from './api';

export type ListProductsParams = NonNullable<
  paths['/api/v1/products']['get']['parameters']['query']
>;

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params: ListProductsParams | undefined) => [...productKeys.lists(), params] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: number) => [...productKeys.details(), id] as const,
} as const;

export function useProducts(params?: ListProductsParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => listProducts(params),
    enabled: options?.enabled ?? true,
  });
}
