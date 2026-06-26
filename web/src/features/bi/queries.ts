import { queryOptions } from '@tanstack/react-query';

import { getHealth } from '@/api/health';

import * as api from './api';

export const biKeys = {
  root: ['bi'] as const,
  executive: (q: { period_start?: string; period_end?: string; branch_id?: number }) =>
    [...biKeys.root, 'executive-kpis', q] as const,
  categoryRevenue: (
    categoryId: number,
    q: { period_start?: string; period_end?: string; branch_id?: number },
  ) => [...biKeys.root, 'category-revenue', categoryId, q] as const,
  healthDashboard: () => ['health', 'dashboard'] as const,
};

export function executiveKpisQueryOptions(args: {
  period_start?: string;
  period_end?: string;
  branch_id?: number;
}) {
  return queryOptions({
    queryKey: biKeys.executive(args),
    queryFn: () => api.getExecutiveKpis(args),
    /** BI panels are heavy; reduce refetch churn vs global 30s (`queryClient.ts`). */
    staleTime: 120_000,
  });
}

export function categoryRevenueQueryOptions(
  categoryId: number,
  args: {
    period_start?: string;
    period_end?: string;
    branch_id?: number;
  },
) {
  return queryOptions({
    queryKey: biKeys.categoryRevenue(categoryId, args),
    queryFn: () => api.getCategoryRevenue(categoryId, args),
    staleTime: 120_000,
  });
}

export function healthDashboardQueryOptions() {
  return queryOptions({
    queryKey: biKeys.healthDashboard(),
    queryFn: getHealth,
    staleTime: 60_000,
  });
}
