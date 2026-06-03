import { queryOptions, useQuery } from '@tanstack/react-query';

import {
  getProductStockCard,
  getTransferBatch,
  listReorderAlerts,
  listStockMovements,
  listStockOnHand,
  listTransferBatches,
} from './api';

export const inventoryKeys = {
  root: ['inventory'] as const,
  stockOnHand: (q: Record<string, unknown>) => [...inventoryKeys.root, 'stockOnHand', q] as const,
  movements: (q: Record<string, unknown>) => [...inventoryKeys.root, 'movements', q] as const,
  transfers: (q: Record<string, unknown>) => [...inventoryKeys.root, 'transfers', q] as const,
  transfer: (id: number) => [...inventoryKeys.root, 'transfer', id] as const,
  reorderAlerts: (q: Record<string, unknown>) => [...inventoryKeys.root, 'reorderAlerts', q] as const,
  stockCard: (productId: number) => [...inventoryKeys.root, 'stockCard', productId] as const,
};

export function stockOnHandQueryOptions(params: Record<string, unknown>) {
  return queryOptions({
    queryKey: inventoryKeys.stockOnHand(params),
    queryFn: () =>
      listStockOnHand({
        ...(params.branch_id != null && params.branch_id !== ''
          ? { branch_id: Number(params.branch_id) }
          : {}),
        ...(params.category_id != null && params.category_id !== ''
          ? { category_id: Number(params.category_id) }
          : {}),
        ...(params.q ? { q: String(params.q) } : {}),
        ...(params.reorder_only ? { reorder_only: true } : {}),
        ...(params.status && params.status !== 'all' ? { status: String(params.status) } : {}),
        ...(params.sort ? { sort: String(params.sort) } : {}),
        limit: params.limit != null ? Number(params.limit) : 500,
        offset: params.offset != null ? Number(params.offset) : 0,
      }),
  });
}

export function reorderAlertsQueryOptions(params: { branch_id?: number } = {}) {
  return queryOptions({
    queryKey: inventoryKeys.reorderAlerts(params),
    queryFn: () => listReorderAlerts(params),
  });
}

export function stockCardQueryOptions(productId: number) {
  return queryOptions({
    queryKey: inventoryKeys.stockCard(productId),
    queryFn: () => getProductStockCard(productId),
  });
}

export function useStockOnHandQuery(params: Record<string, unknown>) {
  return useQuery(stockOnHandQueryOptions(params));
}

export function useMovementsQuery(params: { branch_id?: number; product_id?: number; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: inventoryKeys.movements(params),
    queryFn: () => listStockMovements({ ...params, limit: params.limit ?? 100, offset: params.offset ?? 0 }),
  });
}

export function useTransfersListQuery(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: inventoryKeys.transfers(params ?? {}),
    queryFn: () => listTransferBatches(params),
  });
}

export function useTransferQuery(id: number | null) {
  return useQuery({
    queryKey: inventoryKeys.transfer(id ?? 0),
    queryFn: () => getTransferBatch(id!),
    enabled: id != null,
  });
}

export function useReorderAlertsQuery(params: { branch_id?: number } = {}) {
  return useQuery(reorderAlertsQueryOptions(params));
}

export function useStockCardQuery(productId: number | null) {
  const id = productId ?? 0;
  return useQuery({
    ...stockCardQueryOptions(id),
    enabled: productId != null && productId > 0,
  });
}
