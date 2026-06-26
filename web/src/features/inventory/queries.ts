import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getInventoryPolicyOrNull,
  getProductStockCard,
  getTransferBatch,
  listCommercialRestockAlerts,
  listReorderAlerts,
  listStockMovements,
  listStockOnHand,
  listTransferBatches,
  patchInventoryPolicy,
} from './api';
import * as productionApi from './api/production';

export const inventoryKeys = {
  root: ['inventory'] as const,
  stockOnHand: (q: Record<string, unknown>) => [...inventoryKeys.root, 'stockOnHand', q] as const,
  movements: (q: Record<string, unknown>) => [...inventoryKeys.root, 'movements', q] as const,
  transfers: (q: Record<string, unknown>) => [...inventoryKeys.root, 'transfers', q] as const,
  transfer: (id: number) => [...inventoryKeys.root, 'transfer', id] as const,
  reorderAlerts: (q: Record<string, unknown>) => [...inventoryKeys.root, 'reorderAlerts', q] as const,
  commercialRestockAlerts: (q: Record<string, unknown>) =>
    [...inventoryKeys.root, 'commercialRestockAlerts', q] as const,
  stockCard: (productId: number) => [...inventoryKeys.root, 'stockCard', productId] as const,
  policy: (branchId: number, productId: number) =>
    [...inventoryKeys.root, 'policy', branchId, productId] as const,
  boms: () => [...inventoryKeys.root, 'production', 'boms'] as const,
  bom: (id: number) => [...inventoryKeys.root, 'production', 'bom', id] as const,
  productionOrders: (q: Record<string, unknown>) =>
    [...inventoryKeys.root, 'production', 'orders', q] as const,
  productionOrder: (id: number) => [...inventoryKeys.root, 'production', 'order', id] as const,
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
        ...(params.variant_id != null && params.variant_id !== ''
          ? { variant_id: Number(params.variant_id) }
          : {}),
        ...(params.q ? { q: String(params.q) } : {}),
        ...(params.reorder_only ? { reorder_only: true } : {}),
        ...(params.branch_kind === 'commercial' || params.branch_kind === 'warehouse'
          ? { branch_kind: params.branch_kind as 'commercial' | 'warehouse' }
          : {}),
        ...(params.status && params.status !== 'all' ? { status: String(params.status) } : {}),
        ...(params.sort ? { sort: String(params.sort) } : {}),
        limit: Math.min(params.limit != null ? Number(params.limit) : 100, 2000),
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

export function commercialRestockAlertsQueryOptions(params: { branch_id?: number } = {}) {
  return queryOptions({
    queryKey: inventoryKeys.commercialRestockAlerts(params),
    queryFn: () => listCommercialRestockAlerts(params),
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

export function inventoryPolicyQueryOptions(branchId: number, productId: number) {
  return queryOptions({
    queryKey: inventoryKeys.policy(branchId, productId),
    queryFn: () => getInventoryPolicyOrNull(branchId, productId),
    enabled: branchId > 0 && productId > 0,
  });
}

export function useInventoryPolicyQuery(branchId: number | null, productId: number) {
  const bid = branchId ?? 0;
  return useQuery({
    ...inventoryPolicyQueryOptions(bid, productId),
    enabled: branchId != null && branchId > 0 && productId > 0,
  });
}

export function usePatchInventoryPolicyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      branchId,
      productId,
      body,
    }: {
      branchId: number;
      productId: number;
      body: Parameters<typeof patchInventoryPolicy>[2];
    }) => patchInventoryPolicy(branchId, productId, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.policy(vars.branchId, vars.productId) });
      void qc.invalidateQueries({ queryKey: inventoryKeys.root });
    },
  });
}

export function useMovementsQuery(params: {
  branch_id?: number;
  product_id?: number;
  variant_id?: number;
  limit?: number;
  offset?: number;
}) {
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

export function useCommercialRestockAlertsQuery(params: { branch_id?: number } = {}) {
  return useQuery(commercialRestockAlertsQueryOptions(params));
}

export function useStockCardQuery(productId: number | null) {
  const id = productId ?? 0;
  return useQuery({
    ...stockCardQueryOptions(id),
    enabled: productId != null && productId > 0,
  });
}

export function bomsQueryOptions() {
  return queryOptions({
    queryKey: inventoryKeys.boms(),
    queryFn: () => productionApi.listBoms(),
  });
}

export function bomDetailQueryOptions(bomId: number) {
  return queryOptions({
    queryKey: inventoryKeys.bom(bomId),
    queryFn: () => productionApi.getBom(bomId),
    enabled: bomId > 0,
  });
}

export function productionOrdersQueryOptions(params: Record<string, unknown> = {}) {
  return queryOptions({
    queryKey: inventoryKeys.productionOrders(params),
    queryFn: () =>
      productionApi.listProductionOrders({
        ...(params.branch_id != null ? { branch_id: Number(params.branch_id) } : {}),
        ...(params.status ? { status: String(params.status) } : {}),
      }),
  });
}

export function productionOrderDetailQueryOptions(orderId: number) {
  return queryOptions({
    queryKey: inventoryKeys.productionOrder(orderId),
    queryFn: () => productionApi.getProductionOrder(orderId),
    enabled: orderId > 0,
  });
}
