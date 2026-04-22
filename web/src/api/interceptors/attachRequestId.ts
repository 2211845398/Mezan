import type { InternalAxiosRequestConfig } from 'axios';

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older Safari, tests).
  return `req-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Correlates every request with a UUID in the `X-Request-ID` header so the
 * backend audit log and the frontend Sentry breadcrumb share the same key.
 */
export function attachRequestId(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (!config.headers.get('X-Request-ID')) {
    config.headers.set('X-Request-ID', generateRequestId());
  }
  return config;
}
