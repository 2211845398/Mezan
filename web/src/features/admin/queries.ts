import { useMutation, type UseMutationOptions,useQuery, useQueryClient } from '@tanstack/react-query';

import { notificationKeys } from '@/features/notifications/queries';

import {
  addUserRole,
  archiveBranch,
  authorizeTerminal,
  broadcastNotification,
  clearAllNotificationDeliveries,
  completeOnboarding,
  createBranch,
  createTerminal,
  createUser,
  deauthorizeTerminal,
  deleteNotificationSchedule,
  deletePermissionOverride,
  getBackupStatus,
  getBranch,
  getUser,
  getUserRoles,
  listBranches,
  listNotificationDeliveries,
  listNotificationRuns,
  listNotificationSchedules,
  listNotificationTemplates,
  listPendingOnboarding,
  listPermissionOverrides,
  listPermissions,
  listRoles,
  listTerminals,
  listUsers,
  removeUserRole,
  requestUserPasswordReset,
  runBackup,
  setRolePermissions,
  updateBranch,
  updateTerminal,
  updateUser,
  upsertNotificationSchedule,
  upsertNotificationTemplate,
  upsertPermissionOverride,
} from './api';
import type {
  NotificationBroadcastRequest,
  NotificationScheduleRead,
  UserPermissionOverrideWrite,
  UserRead,
  UserRoleAssign,
} from './types';

export const adminKeys = {
  all: ['admin'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  userList: () => [...adminKeys.users(), 'list'] as const,
  userDetail: (id: number) => [...adminKeys.users(), 'detail', id] as const,
  userRoles: (id: number) => [...adminKeys.users(), id, 'roles'] as const,
  userOverrides: (id: number) => [...adminKeys.users(), id, 'overrides'] as const,
  roles: () => [...adminKeys.all, 'roles'] as const,
  roleList: () => [...adminKeys.roles(), 'list'] as const,
  permissions: () => [...adminKeys.all, 'permissions'] as const,
  branches: (includeArchived: boolean) =>
    [...adminKeys.all, 'branches', { includeArchived }] as const,
  branchDetail: (id: number) => [...adminKeys.all, 'branch', id] as const,
  terminals: (branchId?: number) => [...adminKeys.all, 'terminals', { branchId }] as const,
  backups: () => [...adminKeys.all, 'backups'] as const,
  notificationTemplates: () => [...adminKeys.all, 'notificationTemplates'] as const,
  notificationSchedules: () => [...adminKeys.all, 'notificationSchedules'] as const,
  notificationRuns: () => [...adminKeys.all, 'notificationRuns'] as const,
  notificationDeliveries: () => [...adminKeys.all, 'notificationDeliveries'] as const,
  userRoleSummary: (userIds: number[]) => [...adminKeys.userList(), 'roleSummary', { userIds }] as const,
  onboardingList: (afterUserId: number | null) =>
    [...adminKeys.all, 'onboarding', 'pending', { after: afterUserId }] as const,
} as const;

export function useUsersList(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.userList(),
    queryFn: listUsers,
    enabled: options?.enabled ?? true,
  });
}

export function useUser(userId: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.userDetail(userId),
    queryFn: () => getUser(userId),
    enabled: options?.enabled ?? true,
  });
}

export function useUserRoles(userId: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.userRoles(userId),
    queryFn: () => getUserRoles(userId),
    enabled: options?.enabled ?? true,
  });
}

export function usePermissionOverrides(userId: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.userOverrides(userId),
    queryFn: () => listPermissionOverrides(userId),
    enabled: options?.enabled ?? true,
  });
}

export function useRoles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.roleList(),
    queryFn: listRoles,
    enabled: options?.enabled ?? true,
  });
}

export function usePermissions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.permissions(),
    queryFn: listPermissions,
    enabled: options?.enabled ?? true,
  });
}

export function useBranches(includeArchived: boolean, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.branches(includeArchived),
    queryFn: () => listBranches({ include_archived: includeArchived }),
    enabled: options?.enabled ?? true,
  });
}

export function useBranch(branchId: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.branchDetail(branchId),
    queryFn: () => getBranch(branchId),
    enabled: (options?.enabled ?? true) && Boolean(branchId),
  });
}

export function useTerminals(branchId?: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.terminals(branchId),
    queryFn: () => listTerminals(branchId === undefined ? {} : { branch_id: branchId }),
    enabled: options?.enabled ?? true,
  });
}

export function useBackupStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.backups(),
    queryFn: getBackupStatus,
    enabled: options?.enabled ?? true,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d?.started_at && !d.finished_at) return 2000;
      return false;
    },
  });
}

export function useNotificationTemplates(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.notificationTemplates(),
    queryFn: listNotificationTemplates,
    enabled: options?.enabled ?? true,
  });
}

export function useNotificationSchedules(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.notificationSchedules(),
    queryFn: async () => {
      const r = await listNotificationSchedules();
      return r.items;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useNotificationRuns(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.notificationRuns(),
    queryFn: () => listNotificationRuns(200),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateUser(
  options?: Omit<
    UseMutationOptions<UserRead, Error, Parameters<typeof createUser>[0]>,
    'mutationFn'
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    ...options,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: adminKeys.userList() });
      await options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateUser(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof updateUser>[1]) => updateUser(userId, body),
    onSuccess: async (data) => {
      qc.setQueryData(adminKeys.userDetail(userId), data);
      await qc.invalidateQueries({ queryKey: adminKeys.userList() });
    },
  });
}

export function useAddUserRole(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserRoleAssign) => addUserRole(userId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userRoles(userId) });
      await qc.invalidateQueries({ queryKey: adminKeys.roleList() });
    },
  });
}

export function useRemoveUserRole(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserRoleAssign) => removeUserRole(userId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userRoles(userId) });
    },
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: requestUserPasswordReset,
  });
}

export function useUpsertOverride(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserPermissionOverrideWrite) => upsertPermissionOverride(userId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userOverrides(userId) });
    },
  });
}

export function useDeleteOverride(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrideId: number) => deletePermissionOverride(userId, overrideId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.userOverrides(userId) });
    },
  });
}

export function useSetRolePermissions(roleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof setRolePermissions>[1]) =>
      setRolePermissions(roleId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.roleList() });
    },
  });
}

type ArchiveVars = { branchId: number };

export function useArchiveBranch(includeArchived: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId }: ArchiveVars) => archiveBranch(branchId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.branches(includeArchived) });
    },
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBranch,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.branches(false) });
      await qc.invalidateQueries({ queryKey: adminKeys.branches(true) });
    },
  });
}

export function useUpdateBranch(branchId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof updateBranch>[1]) => updateBranch(branchId, body),
    onSuccess: async (row) => {
      qc.setQueryData(adminKeys.branchDetail(branchId), row);
      await qc.invalidateQueries({ queryKey: adminKeys.branches(false) });
      await qc.invalidateQueries({ queryKey: adminKeys.branches(true) });
    },
  });
}

export function useCreateTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTerminal,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.terminals() });
    },
  });
}

export function useUpdateTerminal(terminalId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof updateTerminal>[1]) => updateTerminal(terminalId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.terminals() });
    },
  });
}

export function useAuthorizeTerminal(terminalId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authorizeTerminal(terminalId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.terminals() });
    },
  });
}

export function useDeauthorizeTerminal(terminalId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deauthorizeTerminal(terminalId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.terminals() });
    },
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runBackup,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.backups() });
    },
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertNotificationTemplate,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.notificationTemplates() });
    },
  });
}

export function useBroadcastNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationBroadcastRequest) => broadcastNotification(body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.notificationDeliveries() });
      await qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useUpsertSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertNotificationSchedule,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.notificationSchedules() });
    },
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteNotificationSchedule,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.notificationSchedules() });
      await qc.invalidateQueries({ queryKey: adminKeys.notificationRuns() });
    },
  });
}

export function useNotificationDeliveries() {
  return useQuery({
    queryKey: adminKeys.notificationDeliveries(),
    queryFn: async () => (await listNotificationDeliveries()).items,
  });
}

export function useClearAllNotificationDeliveries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearAllNotificationDeliveries,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.notificationDeliveries() });
      await qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useToggleScheduleActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: NotificationScheduleRead) =>
      upsertNotificationSchedule({
        name: row.name,
        kind: row.kind,
        interval_minutes: row.interval_minutes,
        target_role_code: row.target_role_code,
        branch_id: row.branch_id,
        parameters: row.parameters,
        is_active: !row.is_active,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.notificationSchedules() });
    },
  });
}

// Pending Onboarding queries and mutations
export function usePendingOnboarding(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.onboardingList(null),
    queryFn: listPendingOnboarding,
    enabled: options?.enabled ?? true,
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      onboardingId,
      body,
    }: {
      onboardingId: number;
      body: Parameters<typeof completeOnboarding>[1];
    }) => completeOnboarding(onboardingId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.onboardingList(null) });
      // Also invalidate employees list as a new employee was created
      await qc.invalidateQueries({ queryKey: ['hr'] });
      await qc.invalidateQueries({ queryKey: adminKeys.userList() });
    },
  });
}
