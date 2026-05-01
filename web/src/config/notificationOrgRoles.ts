/** Mirrors ``ORG_NOTIFICATION_MANAGER_ROLE_CODES`` on the API (seed role codes). */
export const ORG_NOTIFICATION_MANAGER_ROLE_CODES = [
  'OWNER',
  'ADMIN',
  'IT_ADMIN',
  'HR_MANAGER',
] as const;

export function isOrgNotificationManager(roleCodes: readonly string[]): boolean {
  const have = new Set(roleCodes.map((c) => String(c).toUpperCase()));
  return ORG_NOTIFICATION_MANAGER_ROLE_CODES.some((c) => have.has(c));
}
