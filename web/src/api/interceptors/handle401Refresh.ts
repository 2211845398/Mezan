import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

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

      if (status !== 401 || !original || original._mezanRefreshRetry) {
        if (status === 401) {
          broadcastExpired();
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
        throw error;
      }

      setAccessTokenSync(newToken);
      original.headers.set('Authorization', `Bearer ${newToken}`);
      return instance.request(original);
    },
  );
}
