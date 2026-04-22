import type { AxiosError, AxiosInstance } from 'axios';

import { PermissionDeniedError } from '@/api/errors';

/**
 * Converts any HTTP 403 into a typed `PermissionDeniedError` so feature code
 * can branch with `instanceof` instead of inspecting status codes. No retry;
 * the `<Can />` component surfaces the error as `/403` in W-2.
 */
export function installHandle403(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ error?: { code?: string; message?: string; details?: unknown } }>) => {
      if (error.response?.status !== 403) {
        throw error;
      }
      const requestId =
        (error.response.headers?.['x-request-id'] as string | undefined) ?? undefined;
      const payload = error.response.data?.error;
      throw new PermissionDeniedError({
        status: 403,
        requestId,
        payload: payload
          ? {
              code: payload.code ?? 'permission_denied',
              message: payload.message ?? 'Permission denied',
              details: payload.details,
            }
          : undefined,
        cause: error,
      });
    },
  );
}
