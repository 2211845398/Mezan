import { queryOptions } from '@tanstack/react-query';

import { invoiceScanDetailQueryOptions, invoiceScansListQueryOptions } from '@/features/invoice_scans/queries';

import * as api from './api';

export const purchasingKeys = {
  root: ['purchasing'] as const,
  orders: (status?: string) => [...purchasingKeys.root, 'orders', status ?? 'all'] as const,
  order: (id: number) => [...purchasingKeys.root, 'order', id] as const,
  suppliers: () => [...purchasingKeys.root, 'suppliers'] as const,
  supplier: (id: number) => [...purchasingKeys.root, 'supplier', id] as const,
  receipts: (poId: number) => [...purchasingKeys.root, 'receipts', poId] as const,
};

export function purchaseOrdersQueryOptions(status?: string) {
  return queryOptions({
    queryKey: purchasingKeys.orders(status),
    queryFn: () => api.listPurchaseOrders({ limit: 200, offset: 0, ...(status ? { status } : {}) }),
  });
}

export function purchaseOrderQueryOptions(id: number) {
  return queryOptions({
    queryKey: purchasingKeys.order(id),
    queryFn: () => api.getPurchaseOrder(id),
    enabled: !Number.isNaN(id),
  });
}

export function suppliersQueryOptions() {
  return queryOptions({
    queryKey: purchasingKeys.suppliers(),
    queryFn: () => api.listSuppliers(),
  });
}

export function supplierQueryOptions(id: number) {
  return queryOptions({
    queryKey: purchasingKeys.supplier(id),
    queryFn: () => api.getSupplier(id),
    enabled: !Number.isNaN(id),
  });
}

export function goodsReceiptsQueryOptions(poId: number) {
  return queryOptions({
    queryKey: purchasingKeys.receipts(poId),
    queryFn: () => api.listGoodsReceipts(poId),
    enabled: !Number.isNaN(poId),
  });
}

export function matchQueueQueryOptions(status?: string) {
  return invoiceScansListQueryOptions({
    limit: 100,
    offset: 0,
    ...(status ? { status } : {}),
  });
}

export function invoiceScanQueryOptions(id: number) {
  return invoiceScanDetailQueryOptions(id);
}
