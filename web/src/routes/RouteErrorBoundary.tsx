import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

import {
  NotAuthenticatedError,
  PasswordChangeRequiredError,
  PermissionDeniedError,
} from '@/api/errors';
import { env } from '@/config/env';

/*
 * Classifies any error that escapes a lazy route's own boundary:
 *
 *   NotAuthenticatedError → redirect /login (with ?next preserved)
 *   PermissionDeniedError → redirect /403
 *   404 via React Router's ErrorResponse → redirect /404
 *   network / 5xx / unknown → render this fallback (/offline-like card)
 *
 * When `VITE_SENTRY_DSN` is configured we emit a console placeholder that
 * the actual Sentry SDK wiring (Epic W-2.3 later, or W-8) can replace. We
 * deliberately avoid pulling `@sentry/react` into the bundle until the DSN
 * is real.
 */

export default function RouteErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();
  const navigate = useNavigate();

  useEffect(() => {
    if (env.VITE_SENTRY_DSN) {
       
      console.warn('[sentry-placeholder] RouteErrorBoundary captured:', error);
    }
  }, [error]);

  // React Router route response (loader throw, 404, etc.)
  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      return <RedirectEffect to="/login" replace />;
    }
    if (error.status === 403) {
      return <RedirectEffect to="/403" replace />;
    }
    if (error.status === 404) {
      return <RedirectEffect to="/404" replace />;
    }
  }

  if (error instanceof NotAuthenticatedError) {
    return <RedirectEffect to="/login" replace />;
  }
  if (error instanceof PasswordChangeRequiredError) {
    return <RedirectEffect to="/change-password-required" replace />;
  }
  if (error instanceof PermissionDeniedError) {
    return <RedirectEffect to="/403" replace />;
  }

  // Network failure or unknown server error: show an in-page retry card.
  // We do not redirect to /offline automatically so deep-link context survives.
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <h2 className="text-xl font-semibold">{t('auth:errors.route_failed_title')}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('auth:errors.route_failed_body')}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(0)}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('auth:actions.retry')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/offline', { replace: true })}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          {t('auth:actions.offline')}
        </button>
      </div>
    </div>
  );
}

function RedirectEffect({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}
