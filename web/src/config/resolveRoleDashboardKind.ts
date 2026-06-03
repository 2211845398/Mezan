/**
 * Maps `/auth/me/roles` base role codes to a dashboard surface.
 * OWNER/ADMIN keep executive BI; other roles get focused home dashboards.
 * Unknown / empty codes → `fallback` (shortcut home).
 */
export type RoleDashboardKind =
  | 'executive'
  | 'marketing'
  | 'it'
  | 'hr'
  | 'staff'
  | 'fallback';

const PRIORITY: { code: string; kind: RoleDashboardKind }[] = [
  { code: 'OWNER', kind: 'executive' },
  { code: 'ADMIN', kind: 'executive' },
  { code: 'HR_MANAGER', kind: 'hr' },
  { code: 'ACCOUNTANT', kind: 'executive' },
  { code: 'MARKETING_MANAGER', kind: 'executive' },
  { code: 'IT_ADMIN', kind: 'it' },
  { code: 'CASHIER', kind: 'staff' },
  { code: 'FLOOR_STAFF', kind: 'staff' },
];

export function resolveRoleDashboardKind(roleCodes: readonly string[]): RoleDashboardKind {
  const set = new Set(roleCodes);
  for (const { code, kind } of PRIORITY) {
    if (set.has(code)) return kind;
  }
  return 'fallback';
}
