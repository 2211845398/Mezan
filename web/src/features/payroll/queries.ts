import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export type PayslipListFilters = {
  status?: string;
  period_start?: string;
  period_end?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export const payrollKeys = {
  root: ['payroll'] as const,
  list: (filters: PayslipListFilters = {}) =>
    [
      ...payrollKeys.root,
      'payslips',
      filters.status ?? 'all',
      filters.period_start ?? '',
      filters.period_end ?? '',
      filters.q ?? '',
      filters.limit ?? 20,
      filters.offset ?? 0,
    ] as const,
  detail: (id: number) => [...payrollKeys.root, 'payslip', id] as const,
  overview: (period_start: string, period_end: string) =>
    [...payrollKeys.root, 'overview', period_start, period_end] as const,
  period: (year: number, month: number) => [...payrollKeys.root, 'period', year, month] as const,
  policies: () => [...payrollKeys.root, 'policies'] as const,
};

export function payslipsQueryOptions(filters: PayslipListFilters = {}) {
  return queryOptions({
    queryKey: payrollKeys.list(filters),
    queryFn: () =>
      api.listPayslips({
        limit: filters.limit ?? 20,
        offset: filters.offset ?? 0,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.period_start && filters.period_end
          ? { period_start: filters.period_start, period_end: filters.period_end }
          : {}),
        ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
      }),
  });
}

export function payslipQueryOptions(id: number) {
  return queryOptions({
    queryKey: payrollKeys.detail(id),
    queryFn: () => api.getPayslip(id),
    enabled: !Number.isNaN(id),
  });
}

export function payrollOverviewQueryOptions(period_start: string, period_end: string) {
  return queryOptions({
    queryKey: payrollKeys.overview(period_start, period_end),
    queryFn: () => api.listPayrollOverview({ period_start, period_end }),
    enabled: Boolean(period_start && period_end),
  });
}

export function payrollPeriodQueryOptions(year: number, month: number) {
  return queryOptions({
    queryKey: payrollKeys.period(year, month),
    queryFn: () => api.getPayrollPeriod(year, month),
    enabled: year >= 2000 && year <= 2100 && month >= 1 && month <= 12,
  });
}

export function attendancePayrollPoliciesQueryOptions() {
  return queryOptions({
    queryKey: payrollKeys.policies(),
    queryFn: () => api.listAttendancePayrollPolicies(),
  });
}
