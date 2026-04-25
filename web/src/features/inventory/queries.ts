import { useQuery } from '@tanstack/react-query';

import {
  getInvoiceScan,
  getTransferBatch,
  listInvoiceScans,
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
  scans: (q: Record<string, unknown>) => [...inventoryKeys.root, 'scans', q] as const,
  scan: (id: number) => [...inventoryKeys.root, 'scan', id] as const,
};

export function useStockOnHandQuery(params: {
  branch_id?: number;
  category_id?: number;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: inventoryKeys.stockOnHand(params),
    queryFn: () => listStockOnHand(params),
  });
}

export function useMovementsQuery(params: { branch_id?: number; limit?: number; offset?: number }) {
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

export function useInvoiceScansListQuery(params?: { status?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: inventoryKeys.scans(params ?? {}),
    queryFn: () => listInvoiceScans(params),
  });
}

export function useInvoiceScanQuery(id: number | null) {
  return useQuery({
    queryKey: inventoryKeys.scan(id ?? 0),
    queryFn: () => getInvoiceScan(id!),
    enabled: id != null,
  });
}
