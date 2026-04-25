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
