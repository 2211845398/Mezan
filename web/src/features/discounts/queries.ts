import { useQuery } from '@tanstack/react-query';

import { listDiscountRules } from './api';

export const discountKeys = {
  all: ['discounts'] as const,
  lists: () => [...discountKeys.all, 'list'] as const,
  list: () => [...discountKeys.lists()] as const,
} as const;

export function useDiscountRules(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: discountKeys.list(),
    queryFn: listDiscountRules,
    enabled: options?.enabled ?? true,
  });
}
