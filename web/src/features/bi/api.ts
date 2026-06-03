import { apiClient } from '@/api/client';
import type { components } from '@/api/generated/schema';

export type ExecutiveKpiRead = components['schemas']['ExecutiveKpiRead'];

export async function getExecutiveKpis(params?: {
  period_start?: string;
  period_end?: string;
  branch_id?: number;
}): Promise<ExecutiveKpiRead> {
  const { data } = await apiClient.get<ExecutiveKpiRead>('/bi/executive-kpis', { params });
  return data;
}
