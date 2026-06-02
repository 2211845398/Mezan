import { queryOptions } from '@tanstack/react-query';

import * as api from './api';

export const hrKeys = {
  root: ['hr'] as const,
  employees: () => [...hrKeys.root, 'employees'] as const,
  employee: (id: number) => [...hrKeys.root, 'employee', id] as const,
  schedules: (employeeId: number) => [...hrKeys.root, 'schedules', employeeId] as const,
  attendance: (q: Record<string, unknown>) => [...hrKeys.root, 'attendance', q] as const,
  employeesSearch: (q: string) => [...hrKeys.root, 'employeesSearch', q] as const,
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
  mySchedules: () => [...hrKeys.root, 'my-schedules'] as const,
  anomalies: (payload: string) => [...hrKeys.root, 'anomalies', payload] as const,
};

export function employeesQueryOptions(args: { limit: number; offset: number; q?: string }) {
  return queryOptions({
    queryKey: [...hrKeys.employees(), args.limit, args.offset, args.q ?? ''] as const,
    queryFn: () =>
      api.listEmployees({
        limit: args.limit,
        offset: args.offset,
        ...(args.q ? { q: args.q } : {}),
      }),
  });
}

export function employeesPickerQueryOptions() {
  return queryOptions({
    queryKey: [...hrKeys.employees(), 'picker'] as const,
    queryFn: async () => {
      const res = await api.listEmployees({ limit: 200, offset: 0 });
      return res.items;
    },
    staleTime: 60_000,
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

export function mySchedulesQueryOptions(options?: { enabled?: boolean }) {
  return queryOptions({
    queryKey: hrKeys.mySchedules(),
    queryFn: () => api.listMySchedules(),
    enabled: options?.enabled ?? true,
  });
}

export function attendanceListQueryOptions(params: {
  date_from?: string;
  date_to?: string;
  branch_id?: number;
  employee_profile_id?: number;
  classification_status?: string;
  attendance_category?: string;
  limit: number;
  offset: number;
}) {
  return queryOptions({
    queryKey: hrKeys.attendance(params),
    queryFn: () => api.listAttendanceLogsGlobal(params),
  });
}

/** Employee-scoped pages that need all rows in a date window (capped server-side). */
export function attendanceListAllQueryOptions(
  params: {
    date_from?: string;
    date_to?: string;
    branch_id?: number;
    employee_profile_id?: number;
    classification_status?: string;
    attendance_category?: string;
    limit?: number;
  },
) {
  const limit = params.limit ?? 200;
  const key = { ...params, limit, offset: 0, scope: 'all' as const };
  return queryOptions({
    queryKey: hrKeys.attendance(key),
    queryFn: async () => {
      const res = await api.listAttendanceLogsGlobal({ ...params, limit, offset: 0 });
      return res.items;
    },
  });
}

export function employeesSearchQueryOptions(args: { q: string; enabled?: boolean }) {
  return queryOptions({
    queryKey: hrKeys.employeesSearch(args.q),
    queryFn: () =>
      api.listEmployees({
        limit: 25,
        offset: 0,
        ...(args.q.trim() ? { q: args.q.trim() } : {}),
      }),
    enabled: args.enabled ?? true,
    staleTime: 30_000,
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
    ...(params.status !== undefined && params.status !== '' ? { status: params.status } : {}),
    ...(params.employee_profile_id !== undefined ? { employee_profile_id: params.employee_profile_id } : {}),
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

export function leaveBalanceQueryOptions(employeeProfileId: number, selfService = false) {
  return queryOptions({
    queryKey: selfService
      ? ([...hrKeys.root, 'my-leave-balance'] as const)
      : hrKeys.leaveBalance(employeeProfileId),
    queryFn: () =>
      selfService ? api.getMyLeaveBalance() : api.getEmployeeLeaveBalance(employeeProfileId),
    enabled: selfService || (!Number.isNaN(employeeProfileId) && employeeProfileId > 0),
  });
}

// Re-export API functions for direct use
export { createSchedule, deleteSchedule, updateSchedule } from './api';
