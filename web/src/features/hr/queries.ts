import { useQuery } from '@tanstack/react-query';

import { getEmployee, listEmployees } from './api';

export const hrKeys = {
  all: ['hr'] as const,
  employees: () => [...hrKeys.all, 'employees'] as const,
  employeeList: () => [...hrKeys.employees(), 'list'] as const,
  employeeDetail: (id: number) => [...hrKeys.employees(), 'detail', id] as const,
} as const;

export function useEmployees(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: hrKeys.employeeList(),
    queryFn: listEmployees,
    enabled: options?.enabled ?? true,
  });
}

export function useEmployee(id: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: hrKeys.employeeDetail(id),
    queryFn: () => getEmployee({ employee_profile_id: id }),
    enabled: (options?.enabled ?? true) && id > 0,
  });
}
