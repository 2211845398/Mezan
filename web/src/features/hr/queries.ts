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
    classification_status?: string;
    attendance_category?: string;
  }) => [...hrKeys.root, 'attendance', q] as const,
  attendanceSummary: (q: {
    date_from?: string;
    date_to?: string;
    branch_id?: number;
    employee_profile_id?: number;
  }) => [...hrKeys.root, 'attendanceSummary', q] as const,
  timesheet: (employeeId: number) => [...hrKeys.root, 'timesheet', employeeId] as const,
  leaveList: (q: { status?: string; employee_profile_id?: number; limit?: number }) =>
    [...hrKeys.root, 'leave', q] as const,
  leaveBalance: (employeeId: number) => [...hrKeys.root, 'leave-balance', employeeId] as const,
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
  classification_status?: string;
  attendance_category?: string;
}) {
  return queryOptions({
    queryKey: hrKeys.attendance(params),
    queryFn: () => api.listAttendanceLogsGlobal({ ...params, limit: 500, offset: 0 }),
  });
}

export function attendanceSummaryQueryOptions(params: {
  date_from?: string;
  date_to?: string;
  branch_id?: number;
  employee_profile_id?: number;
}) {
  return queryOptions({
    queryKey: hrKeys.attendanceSummary(params),
    queryFn: () => api.getAttendanceSummary(params),
  });
}

export function timesheetQueryOptions(employeeId: number) {
  return queryOptions({
    queryKey: hrKeys.timesheet(employeeId),
    queryFn: () => api.listAttendanceForEmployee(employeeId),
    enabled: !Number.isNaN(employeeId),
  });
}

export function leaveListQueryOptions(params: {
  status?: string;
  employee_profile_id?: number;
  limit?: number;
} = {}) {
  const limit = params.limit ?? 200;
  const keyFilters = {
    ...(params.status !== undefined ? { status: params.status } : {}),
    ...(params.employee_profile_id !== undefined
      ? { employee_profile_id: params.employee_profile_id }
      : {}),
    limit,
  };
  return queryOptions({
    queryKey: hrKeys.leaveList(keyFilters),
    queryFn: () =>
      api.listLeaveRequestsGlobal({
        ...keyFilters,
        offset: 0,
      }),
  });
}

export function leaveBalanceQueryOptions(employeeProfileId: number) {
  return queryOptions({
    queryKey: hrKeys.leaveBalance(employeeProfileId),
    queryFn: () => api.getEmployeeLeaveBalance(employeeProfileId),
    enabled: !Number.isNaN(employeeProfileId) && employeeProfileId > 0,
  });
}

// Re-export API functions for direct use
export { createSchedule, deleteSchedule, updateSchedule } from './api';
