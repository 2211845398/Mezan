import { apiClient } from '@/api/client';

export type HealthResponse = { status: string };

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/health');
  return data;
}
