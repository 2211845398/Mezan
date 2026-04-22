import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ListEmployeesResponse =
  paths['/api/v1/employees']['get']['responses']['200']['content']['application/json'];

export async function listEmployees(): Promise<ListEmployeesResponse> {
  const { data } = await apiClient.get<ListEmployeesResponse>('/employees');
  return data;
}

type GetEmployeeParams = paths['/api/v1/employees/{employee_profile_id}']['get']['parameters']['path'];
type GetEmployeeResponse =
  paths['/api/v1/employees/{employee_profile_id}']['get']['responses']['200']['content']['application/json'];

export async function getEmployee(path: GetEmployeeParams): Promise<GetEmployeeResponse> {
  const { data } = await apiClient.get<GetEmployeeResponse>(
    `/employees/${path.employee_profile_id}`,
  );
  return data;
}
