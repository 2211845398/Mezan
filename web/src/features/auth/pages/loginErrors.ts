import { isAxiosError } from '@/api/client';
import { ApiError } from '@/api/errors';
import { isPasswordChangeRequiredError } from '@/api/passwordChangeRequired';

/**
 * Classify an error raised by `/auth/login` into a localised i18n key.
 *
 * Contract (PROJECT_STATE §5 / W-2 bug 1):
 *  - 401              → errors.invalid_credentials
 *  - 403 w/ "inactive"→ errors.account_inactive
 *  - 429              → errors.rate_limited
 *  - anything else    → errors.unexpected
 */
export function classifyLoginError(err: unknown): string | null {
  if (isPasswordChangeRequiredError(err)) {
    return null;
  }

  if (err instanceof ApiError) {
    if (err.status === 401) return 'auth:errors.invalid_credentials';
    if (err.status === 429) return 'auth:errors.rate_limited';
    if (err.status === 403) {
      const detail = err.details;
      const nestedDetail =
        detail && typeof detail === 'object' && 'detail' in (detail as Record<string, unknown>)
          ? String((detail as { detail?: unknown }).detail ?? '')
          : '';
      const haystack = `${err.message} ${nestedDetail}`.toLowerCase();
      if (haystack.includes('inactive')) return 'auth:errors.account_inactive';
      return 'auth:errors.unexpected';
    }
    return 'auth:errors.unexpected';
  }

  if (isAxiosError(err) && err.response) {
    const { status, data } = err.response;
    if (status === 401) return 'auth:errors.invalid_credentials';
    if (status === 429) return 'auth:errors.rate_limited';
    if (status === 403) {
      const envelope = data as
        | { error?: { message?: string; details?: { detail?: unknown } } }
        | undefined;
      const message =
        (typeof envelope?.error?.message === 'string' ? envelope.error.message : '') || '';
      const innerDetail =
        typeof envelope?.error?.details?.detail === 'string'
          ? (envelope.error.details.detail as string)
          : '';
      const haystack = `${message} ${innerDetail}`.toLowerCase();
      if (haystack.includes('inactive')) return 'auth:errors.account_inactive';
      return 'auth:errors.unexpected';
    }
  }

  return 'auth:errors.unexpected';
}
