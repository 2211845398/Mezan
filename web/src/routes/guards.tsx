import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/features/auth/stores/authStore';

/*
 * Route-level guards. Each guard reads from the auth store and short-circuits
 * via `<Navigate />` when the precondition fails. These wrap `<Outlet />` so
 * they can sit at any level of the nested router tree.
 */

export function RequireAuth({ children }: { children?: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'authenticated') {
    return <>{children ?? <Outlet />}</>;
  }

  // `booting` shouldn't escape AuthBoundary, but treat it defensively the
  // same as unauthenticated to prevent flashing the login page over a
  // pending refresh.
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
  const hasPermission = useAuthStore((s) => s.permissions.has(`${resource}:${action}`));
  if (!hasPermission) {
    // 403 is a render (no redirect) so the browser back button stays useful.
    return <Navigate to="/403" replace state={{ resource, action }} />;
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
