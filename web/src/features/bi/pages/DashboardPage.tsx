import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { dashboardWidgets } from '@/config/dashboardWidgets';
import { useAuthStore } from '@/features/auth/stores/authStore';

const ExecutiveBiDashboardContent = lazy(() => import('./ExecutiveBiDashboardContent'));

function DashboardRouteSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="h-5 w-2/3 max-w-md animate-pulse rounded-md bg-muted" />
      <div className="h-36 animate-pulse rounded-lg border bg-muted/40" />
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

/**
 * Permission-gated dashboard composition surface. Heavy widgets load inside
 * `React.lazy` boundaries to keep first paint smaller (`WEB_FRONTEND_PLAN.md`
 * shell performance notes).
 */
export default function DashboardPage() {
  const { t } = useTranslation('bi');
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const allowedWidgetIds = useMemo(
    () =>
      dashboardWidgets
        .filter((w) => hasPermission(w.permission.resource, w.permission.action))
        .map((w) => w.id),
    [hasPermission],
  );

  const showExecutiveBi = allowedWidgetIds.includes('executive_bi');

  if (!showExecutiveBi) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t('no_widgets')}
      </div>
    );
  }

  return (
    <Suspense fallback={<DashboardRouteSkeleton />}>
      <ExecutiveBiDashboardContent />
    </Suspense>
  );
}
