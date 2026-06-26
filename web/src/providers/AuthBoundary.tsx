import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { MezanLogoLoader } from '@/components/shared/MezanLogoLoader';
import { setRefreshFn } from '@/api/interceptors/handle401Refresh';
import { getMe, refresh as refreshTokenApi } from '@/features/auth/api';
import { applyFullAuthSession, applyRestrictedAuthSession } from '@/lib/authSessionHydrate';
import { resetClientSessionState } from '@/features/auth/signOutSession';
import {
  getRefreshStorageKey,
  getRefreshTokenSync,
  setRefreshTokenSync,
  useAuthStore,
} from '@/features/auth/stores/authStore';

/*
 * Boot-time auth provider:
 *
 *  1. If `localStorage` holds a refresh token, call /auth/refresh to mint
 *     a fresh access token, then prefetch /auth/me + /auth/me/permissions.
 *  2. Install a single-flight refresh callback on the Axios 401 interceptor
 *     so future 401s (access token expiry) can mint a new access token once.
 *  3. Listen for the `mezan:auth-expired` custom event dispatched by the
 *     interceptor when a second 401 arrives — clear auth and let the router
 *     send the user to /login (with `?next=<path>` preserved).
 *
 * During the initial boot call we render a full-screen spinner so the router
 * doesn't flash /login on a valid session.
 */

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const setStatus = useAuthStore((s) => s.setStatus);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setStatusUnauthenticated = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    // 2) Plug the refresh callback into the Axios 401 interceptor.
    setRefreshFn(async () => {
      const token = getRefreshTokenSync();
      if (!token) return null;
      try {
        const data = await refreshTokenApi({ refresh_token: token });
        return data.access_token;
      } catch {
        // Clear the stale refresh so we don't loop trying it.
        setRefreshTokenSync(null);
        return null;
      }
    });

    // 3) Wire the auth-expired event so a hard-failed refresh resets state.
    const onAuthExpired = () => {
      resetClientSessionState();
      setStatusUnauthenticated('unauthenticated');
    };
    window.addEventListener('mezan:auth-expired', onAuthExpired);

    const refreshKey = getRefreshStorageKey();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== refreshKey) return;
      if (e.newValue == null && e.oldValue != null) {
        resetClientSessionState();
        setStatusUnauthenticated('unauthenticated');
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('mezan:auth-expired', onAuthExpired);
      window.removeEventListener('storage', onStorage);
    };
  }, [setStatusUnauthenticated]);

  useEffect(() => {
    // 1) Session restore. Must not use a "run once" ref: React 18 Strict Mode
    //    mounts → unmounts → remounts in dev; skipping the second run leaves
    //    `status` stuck on `booting` after the first async aborts.
    let cancelled = false;

    const existing = getRefreshTokenSync();
    if (!existing) {
      setStatus('unauthenticated');
      return;
    }

    setStatus('booting');

    void (async () => {
      try {
        const tokens = await refreshTokenApi({ refresh_token: existing });
        if (cancelled) return;
        setAccessToken(tokens.access_token);

        const me = await getMe();
        if (cancelled) return;
        if (me.must_change_password) {
          applyRestrictedAuthSession(me);
        } else {
          await applyFullAuthSession(me);
        }
        if (cancelled) return;
      } catch {
        if (cancelled) return;
        setRefreshTokenSync(null);
        resetClientSessionState();
        setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setAccessToken, setStatus]);

  if (status === 'idle' || status === 'booting') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background"
      >
        <MezanLogoLoader label={t('layout.app_name')} />
      </div>
    );
  }

  return <>{children}</>;
}

export default AuthBoundary;
