import { lazy, Suspense, useMemo } from 'react';

import { resolveRoleDashboardKind } from '@/config/resolveRoleDashboardKind';
import { useAuthStore } from '@/features/auth/stores/authStore';

import { NoModuleAccessCard } from '../components/NoModuleAccessCard';
import DashboardHomeFallback from './DashboardHomeFallback';

const ExecutiveBiDashboardContent = lazy(() => import('./ExecutiveBiDashboardContent'));
const MarketingDashboard = lazy(() => import('./role-dashboards/MarketingDashboard'));
const ItAdminDashboard = lazy(() => import('./role-dashboards/ItAdminDashboard'));
const HrManagerDashboard = lazy(() => import('./role-dashboards/HrManagerDashboard'));
const StaffScheduleDashboard = lazy(() => import('./role-dashboards/StaffScheduleDashboard'));

function DashboardRouteSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="h-8 w-1/2 max-w-md animate-pulse rounded-md bg-muted" />
      <div className="h-36 animate-pulse rounded-lg border bg-muted/40" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

function ExecutiveBiGate() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  if (!hasPermission('analytics', 'read')) {
    return (
      <div className="flex min-h-[min(28rem,calc(100dvh-12rem))] flex-col items-center justify-center py-8">
        <NoModuleAccessCard />
      </div>
    );
  }
  return <ExecutiveBiDashboardContent />;
}

/**
 * Role-aware authenticated dashboard: executive BI for OWNER/ADMIN/ACCOUNTANT/
 * MARKETING_MANAGER; focused surfaces for other base roles; shortcut fallback otherwise.
 */
export default function DashboardPage() {
  const roleCodes = useAuthStore((s) => s.roleCodes);
  const kind = useMemo(() => resolveRoleDashboardKind(roleCodes), [roleCodes]);

  const body = useMemo(() => {
    switch (kind) {
      case 'executive':
        return <ExecutiveBiGate />;
      case 'marketing':
        return <MarketingDashboard />;
      case 'it':
        return <ItAdminDashboard />;
      case 'hr':
        return <HrManagerDashboard />;
      case 'staff':
        return <StaffScheduleDashboard />;
      default:
        return <DashboardHomeFallback />;
    }
  }, [kind]);

  return <Suspense fallback={<DashboardRouteSkeleton />}>{body}</Suspense>;
}
