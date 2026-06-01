import { apiClient } from '@/api/client';
import type { PaginatedList } from '@/api/pagination';
import type { components } from '@/api/generated/schema';

export type EmployeeProfileRead = components['schemas']['EmployeeProfileRead'];
export type EmployeeProfileCreate = components['schemas']['EmployeeProfileCreate'];
export type EmployeeProfileUpdate = components['schemas']['EmployeeProfileUpdate'];
export type WeeklyScheduleRead = components['schemas']['WeeklyScheduleRead'];
export type WeeklyScheduleCreate = components['schemas']['WeeklyScheduleCreate'];
export type WeeklyScheduleUpdate = components['schemas']['WeeklyScheduleUpdate'];
export type AttendanceLogRead = components['schemas']['AttendanceLogRead'];
export type LeaveRequestRead = components['schemas']['LeaveRequestRead'];
export type LeaveRequestCreate = components['schemas']['LeaveRequestCreate'];
export type LeaveRequestReview = components['schemas']['LeaveRequestReview'];
export type VacationLeaveBalanceRead = components['schemas']['VacationLeaveBalanceRead'];
export type HrAnomalyRequest = components['schemas']['HrAnomalyRequest'];
export type HrAnomalyResponse = components['schemas']['HrAnomalyResponse'];
export type HrAnomaly = components['schemas']['HrAnomaly'];

export async function listEmployees(params?: {
  limit?: number;
  offset?: number;
  q?: string;
}): Promise<PaginatedList<EmployeeProfileRead>> {
  const { data } = await apiClient.get<PaginatedList<EmployeeProfileRead>>('/employees', {
    params,
  });
  return data;
}

export async function getEmployee(id: number): Promise<EmployeeProfileRead> {
  const { data } = await apiClient.get<EmployeeProfileRead>(`/employees/${id}`);
  return data;
}

export async function createEmployee(body: EmployeeProfileCreate): Promise<EmployeeProfileRead> {
  const { data } = await apiClient.post<EmployeeProfileRead>('/employees', body);
  return data;
}

export async function updateEmployee(
  id: number,
  body: EmployeeProfileUpdate,
): Promise<EmployeeProfileRead> {
  const { data } = await apiClient.patch<EmployeeProfileRead>(`/employees/${id}`, body);
  return data;
}

export async function uploadEmployeeIdentityDocumentImage(
  employeeProfileId: number,
  file: File,
): Promise<{ image_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<{ image_url: string }>(
    `/employees/${employeeProfileId}/identity-document-image`,
    formData,
  );
  return data;
}

export async function listSchedules(employeeProfileId: number): Promise<WeeklyScheduleRead[]> {
  const { data } = await apiClient.get<WeeklyScheduleRead[]>(
    `/employees/${employeeProfileId}/schedules`,
  );
  return data;
}

/** Self-service: current user's weekly schedule (no ``employees:read``). */
export async function listMySchedules(): Promise<WeeklyScheduleRead[]> {
  const { data } = await apiClient.get<WeeklyScheduleRead[]>('/employees/me/schedules');
  return data;
}

export async function createSchedule(
  employeeProfileId: number,
  body: WeeklyScheduleCreate,
): Promise<WeeklyScheduleRead> {
  const { data } = await apiClient.post<WeeklyScheduleRead>(
    `/employees/${employeeProfileId}/schedules`,
    body,
  );
  return data;
}

export async function updateSchedule(
  employeeProfileId: number,
  scheduleId: number,
  body: WeeklyScheduleUpdate,
): Promise<WeeklyScheduleRead> {
  const { data } = await apiClient.patch<WeeklyScheduleRead>(
    `/employees/${employeeProfileId}/schedules/${scheduleId}`,
    body,
  );
  return data;
}

export async function deleteSchedule(employeeProfileId: number, scheduleId: number): Promise<void> {
  await apiClient.delete(`/employees/${employeeProfileId}/schedules/${scheduleId}`);
}

export async function listAttendanceLogsGlobal(params: {
  branch_id?: number;
  employee_profile_id?: number;
  date_from?: string;
  date_to?: string;
  classification_status?: string;
  attendance_category?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedList<AttendanceLogRead>> {
  const { data } = await apiClient.get<PaginatedList<AttendanceLogRead>>('/attendance/logs', {
    params,
  });
  return data;
}

export type AttendanceSummaryRead = {
  by_status: Record<string, number>;
  overtime_minutes_total: number;
  record_count: number;
  absent_days: number;
};

export async function getAttendanceSummary(params: {
  branch_id?: number;
  employee_profile_id?: number;
  date_from?: string;
  date_to?: string;
}): Promise<AttendanceSummaryRead> {
  const { data } = await apiClient.get<AttendanceSummaryRead>('/attendance/summary', { params });
  return data;
}

export async function listAttendanceForEmployee(employeeProfileId: number): Promise<AttendanceLogRead[]> {
  const { data } = await apiClient.get<AttendanceLogRead[]>(
    `/employees/${employeeProfileId}/attendance`,
  );
  return data;
}

export async function listLeaveRequestsGlobal(params: {
  status?: string;
  employee_profile_id?: number;
  limit?: number;
  offset?: number;
}): Promise<LeaveRequestRead[]> {
  const { data } = await apiClient.get<LeaveRequestRead[]>('/leave-requests', { params });
  return data;
}

export async function createLeaveRequest(
  employeeProfileId: number,
  body: LeaveRequestCreate,
): Promise<LeaveRequestRead> {
  const { data } = await apiClient.post<LeaveRequestRead>(
    `/employees/${employeeProfileId}/leave-requests`,
    body,
  );
  return data;
}

export async function getEmployeeLeaveBalance(
  employeeProfileId: number,
): Promise<VacationLeaveBalanceRead> {
  const { data } = await apiClient.get<VacationLeaveBalanceRead>(
    `/employees/${employeeProfileId}/leave-balance`,
  );
  return data;
}

export async function reviewLeaveRequest(
  leaveRequestId: number,
  body: LeaveRequestReview,
  idempotencyKey?: string,
): Promise<LeaveRequestRead> {
  const key = idempotencyKey ?? body.idempotency_key;
  const { data } = await apiClient.post<LeaveRequestRead>(
    `/leave-requests/${leaveRequestId}/review`,
    body,
    key ? { headers: { 'Idempotency-Key': key } } : undefined,
  );
  return data;
}

export async function postHrAnomalies(
  body: HrAnomalyRequest,
  idempotencyKey?: string,
): Promise<HrAnomalyResponse> {
  const { data } = await apiClient.post<HrAnomalyResponse>(
    '/ai/advisory/hr-anomalies',
    body,
    idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined,
  );
  return data;
}
