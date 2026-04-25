import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type PurchaseReorderRequest = components['schemas']['PurchaseReorderRequest'];
export type PurchaseReorderResponse = components['schemas']['PurchaseReorderResponse'];

export async function postPurchaseReorder(
  body: PurchaseReorderRequest,
  idempotencyKey: string,
): Promise<PurchaseReorderResponse> {
  const { data } = await apiClient.post<PurchaseReorderResponse>('/ai/advisory/purchase-reorder', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}
