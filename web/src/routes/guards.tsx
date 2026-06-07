import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { isOrgNotificationManager } from '@/config/notificationOrgRoles';
import {
  CORRESPONDENCE_SELF_SERVICE_PERMISSIONS,
  hasCorrespondenceInboxAccess,
  hasMarketingCampaignAccess,
  hasPricingEvaluationRole,
  isPersonalLeaveBlocked,
} from '@/config/roleNavAccess';
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
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (status === 'authenticated') {
    const mustChange = user?.must_change_password === true;
    if (mustChange && location.pathname !== '/change-password-required') {
      return <Navigate to="/change-password-required" replace />;
    }
    if (!mustChange && location.pathname === '/change-password-required') {
      return <Navigate to="/dashboard" replace />;
    }
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

export function RequireAnyPermission({
  pairs,
  children,
}: {
  pairs: readonly { resource: string; action: string }[];
  children?: ReactNode;
}) {
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const permissions = useAuthStore((s) => s.permissions);
  const hasAny = pairs.some(({ resource, action }) => permissions.has(`${resource}:${action}`));

  if (!permissionsLoaded) {
    return <FullScreenSpinner />;
  }

  if (!hasAny) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children ?? <Outlet />}</>;
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

/** Blocks OWNER/ADMIN from personal leave request UI (`/hr/leave`). */
export function RequirePersonalLeaveAccess({ children }: { children?: ReactNode }) {
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  const hasEmployeesRead = useAuthStore((s) => s.permissions.has('employees:read'));

  if (!permissionsLoaded) {
    return <FullScreenSpinner />;
  }

  if (!hasEmployeesRead || isPersonalLeaveBlocked(roleCodes)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** Correspondence inbox: self-service permission plus manager recipient roles. */
export function RequireCorrespondenceInboxAccess({ children }: { children?: ReactNode }) {
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const permissions = useAuthStore((s) => s.permissions);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  const hasPerm = CORRESPONDENCE_SELF_SERVICE_PERMISSIONS.some(({ resource, action }) =>
    permissions.has(`${resource}:${action}`),
  );

  if (!permissionsLoaded) {
    return <FullScreenSpinner />;
  }

  if (!hasPerm || !hasCorrespondenceInboxAccess(roleCodes)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** Campaign advisor: ai_advisory permission plus marketing/admin roles (not HR_MANAGER). */
export function RequireMarketingCampaignAccess({ children }: { children?: ReactNode }) {
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const permissions = useAuthStore((s) => s.permissions);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  const hasPerm = permissions.has('ai_advisory:run');

  if (!permissionsLoaded) {
    return <FullScreenSpinner />;
  }

  if (!hasPerm || !hasMarketingCampaignAccess(roleCodes)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** Pricing evaluation: permission plus OWNER / ADMIN / ACCOUNTANT role. */
export function RequirePricingEvaluationAccess({ children }: { children?: ReactNode }) {
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded);
  const permissions = useAuthStore((s) => s.permissions);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  const hasPerm =
    permissions.has('catalog:update') || permissions.has('accounting:update');

  if (!permissionsLoaded) {
    return <FullScreenSpinner />;
  }

  if (!hasPerm || !hasPricingEvaluationRole(roleCodes)) {
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
