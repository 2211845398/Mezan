/**
 * Optional UX presets keyed by **base role codes** (Epic 7 fixed catalog).
 *
 * `GET /api/v1/auth/me` currently returns `UserRead` without embedded role
 * codes. When the API adds `roles: { code: string }[]` (or similar), the
 * shell can map codes → `defaultPath` and `widgetOrder` here for nicer
 * defaults. **RBAC remains server-side** — this file only affects ordering and
 * landing suggestions client-side.
 */
export type RoleDashboardPreset = {
  /** First path to suggest after login (must still pass route guards). */
  defaultPath: string;
  /** Subset/order of `dashboardWidgets` ids; intersect with permissions. */
  widgetOrder: readonly string[];
};

/** Extend when `/auth/me` exposes role codes. */
export const ROLE_DASHBOARD_PRESETS_BY_CODE: Record<string, RoleDashboardPreset> = {};
