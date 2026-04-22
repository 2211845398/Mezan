import type { components } from '@/api/generated/schema';

type Schemas = components['schemas'];

export type UserRead = Schemas['UserRead'];
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

export type TerminalRead = Schemas['TerminalRead'];
export type TerminalCreateBody = Schemas['TerminalCreate'];
export type TerminalUpdateBody = Schemas['TerminalUpdate'];
export type TerminalCreateResponse = Schemas['TerminalCreateResponse'];

export type BackupStatusRead = Schemas['BackupStatusRead'];

export type NotificationTemplateRead = Schemas['NotificationTemplateRead'];
export type NotificationTemplateUpsert = Schemas['NotificationTemplateUpsert'];
export type NotificationScheduleRead = Schemas['NotificationScheduleRead'];
export type NotificationScheduleUpsert = Schemas['NotificationScheduleUpsert'];
export type NotificationRunRead = Schemas['NotificationRunRead'];

export type UserOnboardingRead = Schemas['UserOnboardingRead'];

export type PermKey = `${string}:${string}`;
