import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ListUsersResponse =
  paths['/api/v1/users']['get']['responses']['200']['content']['application/json'];

export async function listUsers(): Promise<ListUsersResponse> {
  const { data } = await apiClient.get<ListUsersResponse>('/users');
  return data;
}

type GetConfigResponse =
  paths['/api/v1/config']['get']['responses']['200']['content']['application/json'];

export async function getConfig(): Promise<GetConfigResponse> {
  const { data } = await apiClient.get<GetConfigResponse>('/config');
  return data;
}
