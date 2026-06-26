import type { AxiosError, AxiosInstance } from 'axios';

import { getLocalizedApiErrorMessage } from '@/api/errorMessages';
import {
  ApiError,
  ConflictError,
  ExternalServiceError,
  PasswordChangeRequiredError,
  ServerError,
  ValidationError,
} from '@/api/errors';
import { type BackendEnvelope, mapResponseToApiError } from '@/api/mapError';
import i18n from '@/i18n';
import { notify } from '@/lib/toast';

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
        if (error instanceof PasswordChangeRequiredError) {
          throw error;
        }
        throw error;
      }

      const response = error.response;
      if (!response) {
        notify.error(i18n.t('errors.network'));
        throw new ApiError(error.message || 'Network error', {
          status: 0,
          cause: error,
        });
      }

      const mapped = mapResponseToApiError(
        {
          status: response.status,
          data: response.data,
          headers: response.headers as Record<string, string | string[] | undefined>,
        },
        error,
      );

      if (mapped instanceof ValidationError) {
        throw mapped;
      }
      const tc = i18n.getFixedT(i18n.language, 'common');

      if (mapped instanceof ConflictError) {
        notify.warning(getLocalizedApiErrorMessage(mapped, tc, tc('errors.generic')));
        throw mapped;
      }
      if (mapped instanceof ExternalServiceError || mapped instanceof ServerError) {
        notify.error(i18n.t('errors.server'));
        throw mapped;
      }
      if (mapped instanceof ApiError && mapped.status >= 400 && mapped.status < 500) {
        notify.error(getLocalizedApiErrorMessage(mapped, tc, tc('errors.generic')));
        throw mapped;
      }
      notify.error(getLocalizedApiErrorMessage(mapped, tc, tc('errors.generic')));
      throw mapped;
    },
  );
}
