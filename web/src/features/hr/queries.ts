import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export const hrKeys = {
  root: ['hr'] as const,
  employees: () => [...hrKeys.root, 'employees'] as const,
  employee: (id: number) => [...hrKeys.root, 'employee', id] as const,
  schedules: (employeeId: number) => [...hrKeys.root, 'schedules', employeeId] as const,
  attendance: (q: {
    date_from?: string;
    date_to?: string;
    branch_id?: number;
    employee_profile_id?: number;
  }) => [...hrKeys.root, 'attendance', q] as const,
  timesheet: (employeeId: number) => [...hrKeys.root, 'timesheet', employeeId] as const,
  leaveList: (q: { status?: string; employee_profile_id?: number }) =>
    [...hrKeys.root, 'leave', q] as const,
  anomalies: (payload: string) => [...hrKeys.root, 'anomalies', payload] as const,
};

export function employeesQueryOptions() {
  return queryOptions({
    queryKey: hrKeys.employees(),
    queryFn: () => api.listEmployees(),
  });
}

export function employeeQueryOptions(id: number) {
  return queryOptions({
    queryKey: hrKeys.employee(id),
    queryFn: () => api.getEmployee(id),
    enabled: !Number.isNaN(id),
  });
}

export function schedulesQueryOptions(employeeId: number) {
  return queryOptions({
    queryKey: hrKeys.schedules(employeeId),
    queryFn: () => api.listSchedules(employeeId),
    enabled: !Number.isNaN(employeeId),
  });
}

export function attendanceListQueryOptions(params: {
  date_from?: string;
  date_to?: string;
  branch_id?: number;
  employee_profile_id?: number;
}) {
  return queryOptions({
    queryKey: hrKeys.attendance(params),
    queryFn: () => api.listAttendanceLogsGlobal({ ...params, limit: 500, offset: 0 }),
  });
}

export function timesheetQueryOptions(employeeId: number) {
  return queryOptions({
    queryKey: hrKeys.timesheet(employeeId),
    queryFn: () => api.listAttendanceForEmployee(employeeId),
    enabled: !Number.isNaN(employeeId),
  });
}

export function leaveListQueryOptions(params: { status?: string; employee_profile_id?: number }) {
  return queryOptions({
    queryKey: hrKeys.leaveList(params),
    queryFn: () => api.listLeaveRequestsGlobal({ ...params, limit: 200, offset: 0 }),
  });
}

// Re-export API functions for direct use
export { createSchedule, updateSchedule } from './api';
