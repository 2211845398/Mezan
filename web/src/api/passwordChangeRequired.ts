import type { AxiosError } from 'axios';

import type { BackendEnvelope } from '@/api/mapError';
import { ApiError } from '@/api/errors';

export const PASSWORD_CHANGE_REQUIRED_DETAIL = 'password_change_required';

export function passwordChangeRequiredFromDetails(details: unknown): boolean {
  if (!details || typeof details !== 'object') return false;
  const detail = (details as { detail?: unknown }).detail;
  return detail === PASSWORD_CHANGE_REQUIRED_DETAIL;
}

export function isPasswordChangeRequiredAxiosError(
  error: AxiosError<BackendEnvelope>,
): boolean {
  const details = error.response?.data?.error?.details;
  return passwordChangeRequiredFromDetails(details);
}

export function isPasswordChangeRequiredError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  return passwordChangeRequiredFromDetails(err.details);
}
