import type { components } from '@/api/generated/schema';

type Schemas = components['schemas'];

export type UserRead = Schemas['UserRead'] & { branch_name?: string | null; display_name?: string | null };
export type UserCreateBody = Schemas['UserCreate'];
export type UserUpdateBody = Schemas['UserUpdate'];

export type UserRoleRow = {
  role_id: number;
  role_code: string;
  role_name: string;
  branch_id: number | null;
};

export type UserRoleAssign = Schemas['UserRoleAssign'];
export type UserPermissionOverrideRead = Schemas['UserPermissionOverrideRead'];
export type UserPermissionOverrideWrite = Schemas['UserPermissionOverrideWrite'];

export type RoleWithPermissions = Schemas['RoleWithPermissions'];
export type PermissionRead = Schemas['app__schemas__role__PermissionRead'];
export type RolePermissionUpdate = Schemas['RolePermissionUpdate'];

export type BranchRead = Schemas['BranchRead'];
export type BranchCreateBody = Schemas['BranchCreate'];
export type BranchUpdateBody = Schemas['BranchUpdate'];

export type TerminalRead = Schemas['TerminalRead'] & { branch_name?: string | null };
export type TerminalCreateBody = Schemas['TerminalCreate'];
export type TerminalUpdateBody = Schemas['TerminalUpdate'];
export type TerminalCreateResponse = Schemas['TerminalCreateResponse'];

export type BackupStatusRead = Schemas['BackupStatusRead'];

// Local types for backup history (not yet in generated schema)
export type BackupFileRead = {
  filename: string;
  started_at: string | null;
  finished_at: string | null;
  size_bytes: number;
  size_label: string;
  success: boolean;
  s3_uploaded: boolean;
  message: string;
};

export type BackupHistoryRead = {
  items: BackupFileRead[];
  total: number;
  limit: number;
  offset: number;
};

// Extended AuditLogRead with enriched fields from backend joins
export type AuditLogRead = Schemas['AuditLogRead'] & {
  user_display_name?: string | null;
  user_email?: string | null;
  branch_name?: string | null;
};
export type AuditLogListResponse = Schemas['AuditLogListResponse'];

export type NotificationTemplateRead = Schemas['NotificationTemplateRead'];
export type NotificationTemplateUpsert = Schemas['NotificationTemplateUpsert'];
export type NotificationScheduleRead = Schemas['NotificationScheduleRead'];
export type NotificationScheduleUpsert = Schemas['NotificationScheduleUpsert'];
export type NotificationRunRead = Schemas['NotificationRunRead'];
export type NotificationDeliveryRead = Schemas['NotificationDeliveryRead'] & {
  read_at?: string | null;
};
export type NotificationBroadcastRequest = {
  title: string;
  body: string;
  target_type: 'all' | 'role';
  /** @deprecated merged with ``role_codes`` on the server */
  role_code?: string | null;
  role_codes?: string[] | null;
  /** @deprecated merged with ``branch_ids`` on the server */
  branch_id?: number | null;
  branch_ids?: number[] | null;
  data?: Record<string, unknown>;
};
export type NotificationBroadcastResponse = {
  deliveries_created: number;
  deliveries_sent: number;
  deliveries_failed: number;
  deliveries_skipped: number;
};

export type UserOnboardingRead = Schemas['UserOnboardingRead'];

export type PermKey = `${string}:${string}`;
