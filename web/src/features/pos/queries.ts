import { useMutation } from '@tanstack/react-query';

import type { paths } from '@/api/generated/schema';

import { createCart } from './api';

export type CreateCartBody =
  paths['/api/v1/pos/carts']['post']['requestBody']['content']['application/json'];

export const posKeys = {
  all: ['pos'] as const,
  carts: () => [...posKeys.all, 'carts'] as const,
} as const;

export function useCreateCart() {
  return useMutation({
    mutationKey: [...posKeys.carts(), 'create'],
    mutationFn: (body: CreateCartBody) => createCart(body),
  });
}
