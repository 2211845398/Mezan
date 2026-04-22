import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ListPayslipsParams = NonNullable<
  paths['/api/v1/payroll/payslips']['get']['parameters']['query']
>;
type ListPayslipsResponse =
  paths['/api/v1/payroll/payslips']['get']['responses']['200']['content']['application/json'];

export async function listPayslips(
  params?: ListPayslipsParams,
): Promise<ListPayslipsResponse> {
  const { data } = await apiClient.get<ListPayslipsResponse>('/payroll/payslips', { params });
  return data;
}
