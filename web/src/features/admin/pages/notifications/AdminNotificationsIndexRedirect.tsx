import { Navigate } from 'react-router-dom';

import { isOrgNotificationManager } from '@/config/notificationOrgRoles';
import { useAuthStore } from '@/features/auth/stores/authStore';
import RouteLoader from '@/routes/RouteLoader';

/** Default admin notifications tab: org managers → Send now; others → Routine only. */
export default function AdminNotificationsIndexRedirect() {
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  if (!permissionsLoaded) {
    return <RouteLoader />;
  }
  const to = isOrgNotificationManager(roleCodes) ? 'send-now' : 'routine';
  return <Navigate to={to} replace />;
}
