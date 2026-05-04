import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { ApiError, ServerError, ValidationError } from '@/api/errors';
import { notify } from '@/lib/toast';

type BackendFieldError = {
  loc?: unknown;
  msg?: unknown;
  type?: unknown;
};

type FieldErrorMap = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function detailString(details: unknown): string | null {
  if (typeof details === 'string' && details.trim()) return details.trim();
  if (!isRecord(details)) return null;

  const detail = details.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const first = detail.find((item) => typeof item === 'string' && item.trim());
    return typeof first === 'string' ? first.trim() : null;
  }

  return null;
}

function validationItems(details: unknown): BackendFieldError[] {
  if (!isRecord(details)) return [];
  const raw = details.errors;
  return Array.isArray(raw) ? raw.filter(isRecord) : [];
}

function fieldPathFromLoc(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  const parts = loc.filter((part): part is string | number => {
    if (typeof part === 'number') return true;
    return typeof part === 'string' && part !== 'body' && part !== 'query' && part !== 'path';
  });
  if (parts.length === 0) return null;
  return parts.map(String).join('.');
}

export function fieldErrorsFromApiError(error: unknown): FieldErrorMap {
  if (!(error instanceof ValidationError)) return {};

  const out: FieldErrorMap = {};
  for (const item of validationItems(error.details)) {
    const path = fieldPathFromLoc(item.loc);
    const message = typeof item.msg === 'string' ? item.msg : null;
    if (path && message) out[path] = message;
  }
  return out;
}

export function firstValidationMessage(error: unknown): string | null {
  if (!(error instanceof ValidationError)) return null;
  for (const item of validationItems(error.details)) {
    if (typeof item.msg === 'string' && item.msg.trim()) return item.msg.trim();
  }
  return null;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred.',
): string {
  if (error instanceof ApiError) {
    const detail = detailString(error.details);
    if (detail) return detail;

    const validation = firstValidationMessage(error);
    if (validation) return validation;

    if (error instanceof ServerError) return fallback;
    if (error.message && error.message !== 'Request failed') return error.message;
    return fallback;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function applyApiErrorToForm<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  error: unknown,
): string | null {
  const fields = fieldErrorsFromApiError(error);
  const entries = Object.entries(fields);

  for (const [path, message] of entries) {
    form.setError(
      path as Parameters<typeof form.setError>[0],
      { type: 'server', message },
      { shouldFocus: entries[0]?.[0] === path },
    );
  }

  if (entries.length > 0) return null;
  return getApiErrorMessage(error);
}

export function notifyApiError(error: unknown, fallback?: string): void {
  notify.error(getApiErrorMessage(error, fallback));
}
