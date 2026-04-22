import { useQuery } from '@tanstack/react-query';

import type { paths } from '@/api/generated/schema';

import { listPayslips } from './api';

export type ListPayslipsParams = NonNullable<
  paths['/api/v1/payroll/payslips']['get']['parameters']['query']
>;

export const payrollKeys = {
  all: ['payroll'] as const,
  payslips: () => [...payrollKeys.all, 'payslips'] as const,
  payslipList: (params: ListPayslipsParams | undefined) =>
    [...payrollKeys.payslips(), params] as const,
} as const;

export function usePayslips(params?: ListPayslipsParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: payrollKeys.payslipList(params),
    queryFn: () => listPayslips(params),
    enabled: options?.enabled ?? true,
  });
}
