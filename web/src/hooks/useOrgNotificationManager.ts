import { useMemo } from 'react';

import { isOrgNotificationManager } from '@/config/notificationOrgRoles';
import { useAuthStore } from '@/features/auth/stores/authStore';

/** True when the user holds Owner, Admin, IT Admin, or HR Manager (org-wide notification admin). */
export function useOrgNotificationManager(): boolean {
  const roleCodes = useAuthStore((s) => s.roleCodes);
  return useMemo(() => isOrgNotificationManager(roleCodes), [roleCodes]);
}
