import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export const marketingKeys = {
  root: ['marketing'] as const,
  topProducts: (q: { limit: number; period_start?: string; period_end?: string }) =>
    [...marketingKeys.root, 'top-products', q] as const,
  slowProducts: (q: { threshold_qty: number; limit: number }) =>
    [...marketingKeys.root, 'slow-products', q] as const,
  inventoryAlerts: (days: number) => [...marketingKeys.root, 'inventory-alerts', days] as const,
  promotionPerf: (limit: number) => [...marketingKeys.root, 'promotion-perf', limit] as const,
  salesTrend: (q: { period_start: string; period_end: string } | { days: number }) =>
    [...marketingKeys.root, 'sales-trend', q] as const,
  salesRegister: (q: {
    branch_id: number;
    period_start: string;
    period_end: string;
    limit?: number;
    offset?: number;
    scope?: 'summary' | 'table';
  }) => [...marketingKeys.root, 'sales-register', q] as const,
};

export function topSellingQueryOptions(args: {
  limit: number;
  period_start?: string;
  period_end?: string;
}) {
  return queryOptions({
    queryKey: marketingKeys.topProducts(args),
    queryFn: () => api.getTopSellingProducts(args),
  });
}

export function slowMovingQueryOptions(args: { threshold_qty: number; limit: number }) {
  return queryOptions({
    queryKey: marketingKeys.slowProducts(args),
    queryFn: () => api.getSlowMovingProducts(args),
  });
}

export function inventoryAlertsQueryOptions(days_ahead: number) {
  return queryOptions({
    queryKey: marketingKeys.inventoryAlerts(days_ahead),
    queryFn: () => api.getInventoryAlerts({ days_ahead }),
  });
}

export function promotionPerformanceQueryOptions(limit: number) {
  return queryOptions({
    queryKey: marketingKeys.promotionPerf(limit),
    queryFn: () => api.getPromotionPerformance({ limit }),
  });
}

export function salesTrendForPeriodQueryOptions(period_start: string, period_end: string) {
  return queryOptions({
    queryKey: marketingKeys.salesTrend({ period_start, period_end }),
    queryFn: () => api.getSalesTrendChart({ period_start, period_end }),
    staleTime: 30_000,
  });
}

export function salesInvoicesRegisterSummaryQueryOptions(args: {
  branch_id: number;
  period_start: string;
  period_end: string;
}) {
  return queryOptions({
    queryKey: marketingKeys.salesRegister({ ...args, scope: 'summary' }),
    queryFn: () =>
      api.getSalesInvoicesRegister({ ...args, limit: 1, offset: 0 }),
    staleTime: 0,
  });
}

export function salesInvoicesRegisterTableQueryOptions(args: {
  branch_id: number;
  period_start: string;
  period_end: string;
  limit: number;
  offset: number;
}) {
  return queryOptions({
    queryKey: marketingKeys.salesRegister({ ...args, scope: 'table' }),
    queryFn: () => api.getSalesInvoicesRegister(args),
    staleTime: 0,
  });
}

/** @deprecated Use summary + table query options instead. */
export function salesInvoicesRegisterQueryOptions(args: {
  branch_id: number;
  period_start: string;
  period_end: string;
  limit: number;
  offset: number;
}) {
  return salesInvoicesRegisterTableQueryOptions(args);
}
