import { queryOptions } from '@tanstack/react-query';

import { invoiceScanDetailQueryOptions, invoiceScansListQueryOptions } from '@/features/invoice_scans/queries';

import * as api from './api';

export const purchasingKeys = {
  root: ['purchasing'] as const,
  orders: (status?: string) => [...purchasingKeys.root, 'orders', status ?? 'all'] as const,
  order: (id: number) => [...purchasingKeys.root, 'order', id] as const,
  suppliers: () => [...purchasingKeys.root, 'suppliers'] as const,
  supplier: (id: number) => [...purchasingKeys.root, 'supplier', id] as const,
  supplierStatement: (id: number, args: object) =>
    [...purchasingKeys.root, 'supplier', id, 'statement', args] as const,
  supplierEvaluation: (id: number, args: object) =>
    [...purchasingKeys.root, 'supplier', id, 'evaluation', args] as const,
  receipts: (poId: number) => [...purchasingKeys.root, 'receipts', poId] as const,
};

export function purchaseOrdersQueryOptions(args: {
  status?: string;
  limit: number;
  offset: number;
}) {
  return queryOptions({
    queryKey: [...purchasingKeys.orders(args.status), args.limit, args.offset] as const,
    queryFn: () =>
      api.listPurchaseOrders({
        limit: args.limit,
        offset: args.offset,
        ...(args.status ? { status: args.status } : {}),
      }),
  });
}

export function purchaseOrderStatusTotalQueryOptions(status: string) {
  return queryOptions({
    queryKey: [...purchasingKeys.orders(status), 'total-only'] as const,
    queryFn: () => api.listPurchaseOrders({ status, limit: 1, offset: 0 }),
    select: (data) => data.total,
    staleTime: 60_000,
  });
}

export function purchaseOrderQueryOptions(id: number) {
  return queryOptions({
    queryKey: purchasingKeys.order(id),
    queryFn: () => api.getPurchaseOrder(id),
    enabled: !Number.isNaN(id),
  });
}

export function suppliersQueryOptions(args: { limit: number; offset: number }) {
  return queryOptions({
    queryKey: [...purchasingKeys.suppliers(), args.limit, args.offset] as const,
    queryFn: () => api.listSuppliers({ limit: args.limit, offset: args.offset }),
  });
}

/** Dropdowns/comboboxes: first page only (max 200). */
export function suppliersPickerQueryOptions() {
  return queryOptions({
    queryKey: [...purchasingKeys.suppliers(), 'picker'] as const,
    queryFn: async () => {
      const res = await api.listSuppliers({ limit: 200, offset: 0 });
      return res.items;
    },
    staleTime: 60_000,
  });
}

export function supplierQueryOptions(id: number) {
  return queryOptions({
    queryKey: purchasingKeys.supplier(id),
    queryFn: () => api.getSupplier(id),
    enabled: !Number.isNaN(id),
  });
}

export function supplierStatementQueryOptions(
  id: number,
  args: { date_from: string; date_to: string; branch_id?: number },
) {
  return queryOptions({
    queryKey: purchasingKeys.supplierStatement(id, args),
    queryFn: () => api.getSupplierStatement(id, args),
    enabled: !Number.isNaN(id) && id > 0,
  });
}

export function supplierEvaluationQueryOptions(
  id: number,
  args?: { period_days?: number; branch_id?: number },
) {
  return queryOptions({
    queryKey: purchasingKeys.supplierEvaluation(id, args ?? {}),
    queryFn: () => api.getSupplierEvaluation(id, args),
    enabled: !Number.isNaN(id) && id > 0,
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
