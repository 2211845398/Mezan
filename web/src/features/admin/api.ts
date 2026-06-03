import { apiClient } from '@/api/client';
import type { PaginatedList } from '@/api/pagination';

import type {
  BackupStatusRead,
  BranchCreateBody,
  BranchRead,
  BranchUpdateBody,
  NotificationBroadcastRequest,
  NotificationBroadcastResponse,
  NotificationDeliveryRead,
  NotificationRunRead,
  NotificationScheduleRead,
  NotificationScheduleUpsert,
  NotificationTemplateRead,
  NotificationTemplateUpsert,
  PermissionRead,
  RolePermissionUpdate,
  RoleWithPermissions,
  TerminalCreateBody,
  TerminalCreateResponse,
  TerminalRead,
  TerminalUpdateBody,
  UserCreateBody,
  UserOnboardingRead,
  UserPermissionOverrideRead,
  UserPermissionOverrideWrite,
  UserRead,
  UserRoleAssign,
  UserRoleRow,
  UserUpdateBody,
} from './types';

export async function listUsers(params?: {
  limit?: number;
  offset?: number;
}): Promise<PaginatedList<UserRead>> {
  const { data } = await apiClient.get<PaginatedList<UserRead>>('/users', { params });
  return data;
}

export async function listOnboardingAssignees(): Promise<UserRead[]> {
  const { data } = await apiClient.get<UserRead[]>('/users/onboarding-assignees');
  return data;
}

export async function createUser(body: UserCreateBody): Promise<UserRead> {
  const { data } = await apiClient.post<UserRead>('/users', body);
  return data;
}

export async function getUser(userId: number): Promise<UserRead> {
  const { data } = await apiClient.get<UserRead>(`/users/${userId}`);
  return data;
}

export async function updateUser(userId: number, body: UserUpdateBody): Promise<UserRead> {
  const { data } = await apiClient.patch<UserRead>(`/users/${userId}`, body);
  return data;
}

export async function getUserRoles(userId: number): Promise<UserRoleRow[]> {
  const { data } = await apiClient.get<UserRoleRow[]>(`/users/${userId}/roles`);
  return data;
}

export async function addUserRole(userId: number, body: UserRoleAssign): Promise<unknown> {
  const { data } = await apiClient.post(`/users/${userId}/roles`, body);
  return data;
}

export async function removeUserRole(userId: number, body: UserRoleAssign): Promise<void> {
  await apiClient.delete(`/users/${userId}/roles`, { data: body });
}

export async function requestUserPasswordReset(userId: number): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    `/users/${userId}/password-reset-request`,
  );
  return data;
}

export async function listPermissionOverrides(
  userId: number,
): Promise<UserPermissionOverrideRead[]> {
  const { data } = await apiClient.get<UserPermissionOverrideRead[]>(
    `/users/${userId}/permission-overrides`,
  );
  return data;
}

export async function upsertPermissionOverride(
  userId: number,
  body: UserPermissionOverrideWrite,
): Promise<UserPermissionOverrideRead> {
  const { data } = await apiClient.put<UserPermissionOverrideRead>(
    `/users/${userId}/permission-overrides`,
    body,
  );
  return data;
}

export async function deletePermissionOverride(
  userId: number,
  overrideId: number,
): Promise<void> {
  await apiClient.delete(`/users/${userId}/permission-overrides/${overrideId}`);
}

export async function listPendingOnboarding(): Promise<UserOnboardingRead[]> {
  const { data } = await apiClient.get<UserOnboardingRead[]>('/hr/onboarding/pending');
  return data;
}

export type PendingOnboardingSubjectPatch = {
  first_name?: string | null;
  father_name?: string | null;
  family_name?: string | null;
  branch_id?: number | null;
  role_code?: string | null;
};

export async function patchPendingOnboardingSubject(
  onboardingId: number,
  body: PendingOnboardingSubjectPatch,
): Promise<UserRead> {
  const { data } = await apiClient.patch<UserRead>(`/hr/onboarding/${onboardingId}/subject`, body);
  return data;
}

export async function uploadOnboardingIdentityDocumentImage(
  onboardingId: number,
  file: File,
): Promise<{ image_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<{ image_url: string }>(
    `/hr/onboarding/${onboardingId}/identity-document-image`,
    formData,
  );
  return data;
}

export async function completeOnboarding(
  onboardingId: number,
  body: {
    assigned_hr_user_id?: number | null;
    job_title?: string | null;
    contract_start?: string | null;
    contract_end?: string | null;
    salary_amount?: string | null;
    hourly_rate?: string | null;
    salary_currency?: string | null;
    bank_account?: string | null;
    notes?: string | null;
    identity_document_type?: string | null;
    identity_document_number?: string | null;
    schedules?: Array<{
      weekday: number;
      start_time: string;
      end_time: string;
      is_day_off: boolean;
      branch_id: number;
    }>;
  },
): Promise<UserOnboardingRead> {
  const { data } = await apiClient.post<UserOnboardingRead>(
    `/hr/onboarding/${onboardingId}/complete`,
    body,
  );
  return data;
}

export async function listPermissions(): Promise<PermissionRead[]> {
  const { data } = await apiClient.get<PermissionRead[]>('/permissions');
  return data;
}

export async function listRoles(): Promise<RoleWithPermissions[]> {
  const { data } = await apiClient.get<RoleWithPermissions[]>('/roles');
  return data;
}

export async function setRolePermissions(
  roleId: number,
  body: RolePermissionUpdate,
): Promise<RoleWithPermissions> {
  const { data } = await apiClient.put<RoleWithPermissions>(`/roles/${roleId}/permissions`, body);
  return data;
}

export async function listBranches(params?: { include_archived?: boolean }): Promise<BranchRead[]> {
  const { data } = await apiClient.get<BranchRead[]>('/branches', { params });
  return data;
}

export async function getBranch(branchId: number): Promise<BranchRead> {
  const { data } = await apiClient.get<BranchRead>(`/branches/${branchId}`);
  return data;
}

export async function createBranch(body: BranchCreateBody): Promise<BranchRead> {
  const { data } = await apiClient.post<BranchRead>('/branches', body);
  return data;
}

export async function updateBranch(branchId: number, body: BranchUpdateBody): Promise<BranchRead> {
  const { data } = await apiClient.put<BranchRead>(`/branches/${branchId}`, body);
  return data;
}

export async function archiveBranch(branchId: number): Promise<void> {
  await apiClient.delete(`/branches/${branchId}`);
}

export async function listTerminals(params?: { branch_id?: number }): Promise<TerminalRead[]> {
  const { data } = await apiClient.get<TerminalRead[]>('/terminals', { params });
  return data;
}

export async function createTerminal(body: TerminalCreateBody): Promise<TerminalCreateResponse> {
  const { data } = await apiClient.post<TerminalCreateResponse>('/terminals', body);
  return data;
}

export async function updateTerminal(
  terminalId: number,
  body: TerminalUpdateBody,
): Promise<TerminalRead> {
  const { data } = await apiClient.patch<TerminalRead>(`/terminals/${terminalId}`, body);
  return data;
}

export async function authorizeTerminal(terminalId: number): Promise<TerminalRead> {
  const { data } = await apiClient.patch<TerminalRead>(`/terminals/${terminalId}/authorize`);
  return data;
}

export async function deauthorizeTerminal(terminalId: number): Promise<TerminalRead> {
  const { data } = await apiClient.patch<TerminalRead>(`/terminals/${terminalId}/deauthorize`);
  return data;
}

export async function getBackupStatus(): Promise<BackupStatusRead> {
  const { data } = await apiClient.get<BackupStatusRead>('/admin/backups/status');
  return data;
}

export async function runBackup(): Promise<BackupStatusRead> {
  const { data } = await apiClient.post<BackupStatusRead>('/admin/backups/run');
  return data;
}

export async function listNotificationTemplates(): Promise<NotificationTemplateRead[]> {
  const { data } = await apiClient.get<NotificationTemplateRead[]>('/admin/notifications/templates');
  return data;
}

export async function upsertNotificationTemplate(
  body: NotificationTemplateUpsert,
): Promise<NotificationTemplateRead> {
  const { data } = await apiClient.put<NotificationTemplateRead>(
    '/admin/notifications/templates',
    body,
  );
  return data;
}

export async function listNotificationSchedules(): Promise<{ items: NotificationScheduleRead[] }> {
  const { data } = await apiClient.get<{ items: NotificationScheduleRead[] }>(
    '/admin/notifications/schedules',
  );
  return data;
}

export async function upsertNotificationSchedule(
  body: NotificationScheduleUpsert,
): Promise<NotificationScheduleRead> {
  const { data } = await apiClient.put<NotificationScheduleRead>(
    '/admin/notifications/schedules',
    body,
  );
  return data;
}

export async function deleteNotificationSchedule(scheduleId: number): Promise<void> {
  await apiClient.delete(`/admin/notifications/schedules/${scheduleId}`);
}

export async function listNotificationRuns(limit = 200): Promise<NotificationRunRead[]> {
  const { data } = await apiClient.get<NotificationRunRead[]>('/admin/notifications/runs', {
    params: { limit },
  });
  return data;
}

export async function listNotificationDeliveries(
  limit = 200,
): Promise<{ items: NotificationDeliveryRead[] }> {
  const { data } = await apiClient.get<{ items: NotificationDeliveryRead[] }>(
    '/admin/notifications/deliveries',
    { params: { limit } },
  );
  return data;
}

export async function clearAllNotificationDeliveries(): Promise<void> {
  await apiClient.delete('/admin/notifications/deliveries');
}

export async function broadcastNotification(
  body: NotificationBroadcastRequest,
): Promise<NotificationBroadcastResponse> {
  const { data } = await apiClient.post<NotificationBroadcastResponse>(
    '/admin/notifications/broadcast',
    body,
  );
  return data;
}

export async function triggerNotificationSchedule(scheduleId: number): Promise<unknown> {
  const { data } = await apiClient.post(
    `/admin/notifications/schedules/${scheduleId}/run`,
  );
  return data;
}
