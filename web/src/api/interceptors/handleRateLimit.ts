import type { AxiosError, AxiosInstance } from 'axios';

import { RateLimitedError } from '@/api/errors';
import i18n from '@/i18n';
import { notify } from '@/lib/toast';

function parseRetryAfter(raw: string | undefined): number | null {
  if (!raw) return null;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return null;
}

/**
 * On HTTP 429, surfaces the `Retry-After` delay to the toast system and
 * throws a typed `RateLimitedError` so feature hooks can decide whether to
 * retry manually. No automatic retry here — that is the caller's choice.
 */
export function installHandleRateLimit(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ error?: { code?: string; message?: string; details?: unknown } }>) => {
      if (error.response?.status !== 429) {
        throw error;
      }
      const retryAfterSeconds = parseRetryAfter(
        error.response.headers?.['retry-after'] as string | undefined,
      );
      const requestId =
        (error.response.headers?.['x-request-id'] as string | undefined) ?? undefined;
      const payload = error.response.data?.error;

      notify.warning(i18n.t('errors.rate_limited'), {
        ...(retryAfterSeconds !== null
          ? { description: `Retry-After: ${retryAfterSeconds}s` }
          : {}),
      });

      throw new RateLimitedError({
        status: 429,
        requestId,
        retryAfterSeconds,
        payload: payload
          ? {
              code: payload.code ?? 'rate_limited',
              message: payload.message ?? 'Rate limited',
              details: payload.details,
            }
          : undefined,
        cause: error,
      });
    },
  );
}
