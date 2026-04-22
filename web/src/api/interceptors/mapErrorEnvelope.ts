import type { AxiosError, AxiosInstance } from 'axios';

import {
  ApiError,
  type ApiErrorPayload,
  ConflictError,
  ExternalServiceError,
  NotAuthenticatedError,
  ServerError,
  ValidationError,
} from '@/api/errors';
import i18n from '@/i18n';
import { notify } from '@/lib/toast';

type BackendEnvelope = {
  error?: Partial<ApiErrorPayload> & { code?: string; message?: string; details?: unknown };
  request_id?: string;
};

function extractPayload(
  envelope: BackendEnvelope | undefined,
  fallbackCode: string,
): ApiErrorPayload {
  const e = envelope?.error;
  return {
    code: e?.code ?? fallbackCode,
    message: e?.message ?? 'Request failed',
    details: e?.details,
  };
}

/**
 * Terminal response interceptor: anything that reaches this point has not
 * been claimed by a more specific handler (401 refresh / 403 / 429 / 5xx
 * retries). Normalise the backend envelope into a typed `ApiError` subclass
 * and show a toast for non-validation failures.
 */
export function installMapErrorEnvelope(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<BackendEnvelope>) => {
      if (error instanceof ApiError) {
        throw error;
      }

      const response = error.response;
      if (!response) {
        // Network error — surface a generic "cannot reach server" toast.
        notify.error(i18n.t('errors.network'));
        throw new ApiError(error.message || 'Network error', {
          status: 0,
          cause: error,
        });
      }

      const requestId =
        (response.headers?.['x-request-id'] as string | undefined) ??
        response.data?.request_id ??
        undefined;
      const status = response.status;

      const payload = extractPayload(response.data, `http_${status}`);

      const init = { status, requestId, payload, cause: error };

      switch (status) {
        case 401:
          throw new NotAuthenticatedError(init);
        case 422:
        case 400:
          // Validation errors flow to the active form, no toast here.
          throw new ValidationError(init);
        case 409:
          notify.warning(payload.message);
          throw new ConflictError(init);
        case 502:
        case 503:
        case 504:
          notify.error(i18n.t('errors.server'));
          throw new ExternalServiceError(init);
      }

      if (status >= 500) {
        notify.error(i18n.t('errors.server'));
        throw new ServerError(init);
      }

      notify.error(payload.message);
      throw new ApiError(payload.message, init);
    },
  );
}
