/**
 * Optional UX presets keyed by **base role codes** (Epic 7 fixed catalog).
 * Role codes come from `GET /api/v1/auth/me/roles`. **RBAC remains server-side**
 * — presets only affect client landing and widget ordering hints.
 */
export type RoleDashboardPreset = {
  /** First path to suggest after login (must still pass route guards). */
  defaultPath: string;
  /** Subset/order of `dashboardWidgets` ids; intersect with permissions. */
  widgetOrder: readonly string[];
};

export const ROLE_DASHBOARD_PRESETS_BY_CODE: Record<string, RoleDashboardPreset> = {
  OWNER: { defaultPath: '/dashboard', widgetOrder: ['executive_bi'] },
  ADMIN: { defaultPath: '/dashboard', widgetOrder: ['executive_bi'] },
};

export { resolveRoleDashboardKind, type RoleDashboardKind } from './resolveRoleDashboardKind';
