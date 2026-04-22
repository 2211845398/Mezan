import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

/*
 * POS HTTP surface (W-4 seed).
 *
 * TODO(W-5.1): wire optimistic cart updates + stable idempotency for finalize,
 * capture, and offline replay per OFFLINE_POS.md §4.8 (queue shape + conflict UX).
 */

type CreateCartBody =
  paths['/api/v1/pos/carts']['post']['requestBody']['content']['application/json'];
type CreateCartResponse =
  paths['/api/v1/pos/carts']['post']['responses']['201']['content']['application/json'];

export async function createCart(body: CreateCartBody): Promise<CreateCartResponse> {
  const { data } = await apiClient.post<CreateCartResponse>('/pos/carts', body);
  return data;
}
