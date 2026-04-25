import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export const payrollKeys = {
  root: ['payroll'] as const,
  list: (status?: string) => [...payrollKeys.root, 'payslips', status ?? 'all'] as const,
  detail: (id: number) => [...payrollKeys.root, 'payslip', id] as const,
};

export function payslipsQueryOptions(status?: string) {
  return queryOptions({
    queryKey: payrollKeys.list(status),
    queryFn: () => api.listPayslips(status ? { status } : undefined),
  });
}

export function payslipQueryOptions(id: number) {
  return queryOptions({
    queryKey: payrollKeys.detail(id),
    queryFn: () => api.getPayslip(id),
    enabled: !Number.isNaN(id),
  });
}
