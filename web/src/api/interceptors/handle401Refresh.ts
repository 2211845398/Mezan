import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { notAuthenticatedFromAxios } from '@/api/mapError';
import { clearAuthSync, setAccessTokenSync } from '@/stores/authStore';

/*
 * Single-flight 401 refresh handler.
 *
 * On first 401: call POST /api/v1/auth/refresh exactly once even if N requests
 * all 401 in parallel. All callers await the same promise. On success retry
 * originals; on failure clear auth and dispatch `mezan:auth-expired`.
 *
 * The actual refresh endpoint is wired in W-2; here we delegate to a callback
 * that W-2 will replace. For W-1 the default callback just rejects so the
 * fallback path ("clear auth and broadcast") stays exercised.
 */

type RefreshFn = () => Promise<string | null>;

let refreshFn: RefreshFn = () => Promise.resolve(null);

/** Allows W-2's auth feature to plug in the real refresh call. */
export function setRefreshFn(fn: RefreshFn): void {
  refreshFn = fn;
}

export const AUTH_EXPIRED_EVENT = 'mezan:auth-expired' as const;

let inflight: Promise<string | null> | null = null;

type RetryConfig = InternalAxiosRequestConfig & { _mezanRefreshRetry?: boolean };

/*
 * Endpoints whose own 401 *is the business outcome* (wrong password,
 * expired refresh, invalid reset token). We never try to refresh on these
 * because the refresh attempt is either guaranteed to fail or would swallow
 * the real error, both of which surface as confusing toasts (W-2 bug 1).
 */
const REFRESH_SKIP_PATHS: readonly RegExp[] = [
  /\/auth\/login$/,
  /\/auth\/refresh$/,
  /\/auth\/logout$/,
  /\/auth\/password-reset\/.+$/,
];

function shouldSkipRefresh(config: InternalAxiosRequestConfig | undefined): boolean {
  const url = config?.url ?? '';
  return REFRESH_SKIP_PATHS.some((re) => re.test(url));
}

function broadcastExpired(): void {
  clearAuthSync();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

/**
 * Attach the 401-refresh response interceptor to the given Axios instance.
 */
export function installHandle401Refresh(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const status = error.response?.status;
      const original = error.config as RetryConfig | undefined;

      // Skip the refresh dance on auth endpoints whose 401 is a legitimate
      // business response (bad password, stale refresh, invalid reset token).
      // Propagate the error unchanged so the form handler can classify it.
      if (status === 401 && shouldSkipRefresh(original)) {
        throw notAuthenticatedFromAxios(error);
      }

      if (status !== 401 || !original || original._mezanRefreshRetry) {
        if (status === 401) {
          broadcastExpired();
        }
        if (status === 401) {
          throw notAuthenticatedFromAxios(error);
        }
        throw error;
      }

      original._mezanRefreshRetry = true;

      inflight ??= (async () => {
        try {
          return await refreshFn();
        } finally {
          queueMicrotask(() => {
            inflight = null;
          });
        }
      })();

      const newToken = await inflight.catch(() => null);

      if (!newToken) {
        broadcastExpired();
        throw notAuthenticatedFromAxios(error);
      }

      setAccessTokenSync(newToken);
      original.headers.set('Authorization', `Bearer ${newToken}`);
      return instance.request(original);
    },
  );
}
