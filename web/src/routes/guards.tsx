import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { isOrgNotificationManager } from '@/config/notificationOrgRoles';
import { useAuthStore } from '@/features/auth/stores/authStore';

/*
 * Route-level guards. Each guard reads from the auth store and short-circuits
 * via `<Navigate />` when the precondition fails. These wrap `<Outlet />` so
 * they can sit at any level of the nested router tree.
 */

function FullScreenSpinner() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[50vh] items-center justify-center"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'authenticated') {
    return <>{children ?? <Outlet />}</>;
  }

  // Boot/idle: still deciding whether the user is logged in — render a
  // loader so we never flash /login over a valid session.
  if (status === 'idle' || status === 'booting') {
    return <FullScreenSpinner />;
  }

  const next = `${location.pathname}${location.search}`;
  const search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  return <Navigate to={`/login${search}`} replace />;
}

export function RequirePermission({
  resource,
  action,
  children,
}: {
  resource: string;
  action: string;
  children?: ReactNode;
}) {
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const hasPermission = useAuthStore((s) => s.permissions.has(`${resource}:${action}`));

  // W-2 bug 2: if permissions haven't resolved yet we must NOT bounce to /403
  // on the first render — that would flash "forbidden" on every successful
  // login. Render a loader instead; `AuthBoundary` / login flip `permissionsLoaded`
  // once `/auth/me/permissions` lands.
  if (!permissionsLoaded) {
    return <FullScreenSpinner />;
  }

  if (!hasPermission) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

export function RequireOrgNotificationManager({ children }: { children?: ReactNode }) {
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const roleCodes = useAuthStore((s) => s.roleCodes);

  if (!permissionsLoaded) {
    return <FullScreenSpinner />;
  }

  if (!isOrgNotificationManager(roleCodes)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

export function RequireBranchContext({ children }: { children?: ReactNode }) {
  const branchId = useAuthStore((s) => s.activeBranchId);
  if (branchId === null) {
    return <Navigate to="/select-branch" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}
