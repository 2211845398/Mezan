import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ExecutiveKpisResponse =
  paths['/api/v1/bi/executive-kpis']['get']['responses']['200']['content']['application/json'];

export async function getExecutiveKpis(): Promise<ExecutiveKpisResponse> {
  const { data } = await apiClient.get<ExecutiveKpisResponse>('/bi/executive-kpis');
  return data;
}
