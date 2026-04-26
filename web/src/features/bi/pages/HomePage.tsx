import { Navigate } from 'react-router-dom';

import { useAuthStore } from '@/features/auth/stores/authStore';

import DashboardHomeFallback from './DashboardHomeFallback';

/**
 * Authenticated index `/`: executives go straight to BI; everyone else gets
 * a shortcut home built from permitted nav leaves.
 */
export default function HomePage() {
  const hasAnalytics = useAuthStore((s) => s.hasPermission('analytics', 'read'));
  if (hasAnalytics) {
    return <Navigate to="/dashboard" replace />;
  }
  return <DashboardHomeFallback />;
}
