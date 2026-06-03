import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export const invoiceScanKeys = {
  root: ['invoice-scans'] as const,
  list: (params: Record<string, unknown>) => [...invoiceScanKeys.root, 'list', params] as const,
  detail: (id: number) => [...invoiceScanKeys.root, 'detail', id] as const,
};

export function invoiceScansListQueryOptions(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const q = {
    limit: params?.limit ?? 20,
    offset: params?.offset ?? 0,
    ...(params?.status ? { status: params.status } : {}),
  };
  return queryOptions({
    queryKey: invoiceScanKeys.list(q as Record<string, unknown>),
    queryFn: () => api.listInvoiceScans(q),
  });
}

export function invoiceScanDetailQueryOptions(id: number) {
  return queryOptions({
    queryKey: invoiceScanKeys.detail(id),
    queryFn: () => api.getInvoiceScan(id),
    enabled: !Number.isNaN(id),
  });
}
