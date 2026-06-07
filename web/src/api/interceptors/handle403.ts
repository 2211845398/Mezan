import type { AxiosError, AxiosInstance } from 'axios';

import { PermissionDeniedError, PasswordChangeRequiredError } from '@/api/errors';
import type { BackendEnvelope } from '@/api/mapError';
import { isPasswordChangeRequiredAxiosError } from '@/api/passwordChangeRequired';
import { getMe } from '@/features/auth/api';
import { getAccessTokenSync } from '@/features/auth/stores/authStore';
import { applyRestrictedAuthSession } from '@/lib/authSessionHydrate';

/**
 * Converts HTTP 403 into typed errors. Password-change gate responses are
 * handled without treating them as generic permission denial.
 */
export function installHandle403(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<BackendEnvelope>) => {
      if (error.response?.status !== 403) {
        throw error;
      }

      const requestId =
        (error.response.headers?.['x-request-id'] as string | undefined) ?? undefined;
      const payload = error.response.data?.error;

      if (isPasswordChangeRequiredAxiosError(error) && getAccessTokenSync()) {
        try {
          const me = await getMe();
          applyRestrictedAuthSession(me);
        } catch {
          // Keep the typed error so callers can redirect without a generic toast.
        }

        throw new PasswordChangeRequiredError({
          status: 403,
          requestId,
          payload: payload
            ? {
                code: payload.code ?? 'permission_denied',
                message: payload.message ?? 'Password change required',
                details: payload.details,
              }
            : undefined,
          cause: error,
        });
      }

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
