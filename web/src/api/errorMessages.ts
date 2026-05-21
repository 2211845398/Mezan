import type { TFunction } from 'i18next';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { ApiError, ServerError, ValidationError } from '@/api/errors';
import i18n from '@/i18n';
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

function detailsMachineCode(details: unknown): string | null {
  if (!isRecord(details)) return null;
  const code = details.code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

/** Localized message for one FastAPI/Pydantic validation item. */
export function localizedValidationItemMessage(
  item: BackendFieldError,
  t: TFunction<'common'>,
): string {
  const loc = item.loc;
  const field = Array.isArray(loc) ? String(loc[loc.length - 1] ?? '') : '';
  const typ = typeof item.type === 'string' ? item.type : '';
  const rawMsg = typeof item.msg === 'string' ? item.msg : '';

  const isEmailField = field === 'email' || field.endsWith('.email');
  const isPhoneField = field === 'phone' || field.endsWith('.phone');
  const looksLikeEmailError =
    typ === 'value_error.email' ||
    (typeof typ === 'string' && typ.includes('email')) ||
    (isEmailField && typ === 'value_error' && rawMsg.toLowerCase().includes('email'));

  if (isEmailField && looksLikeEmailError) {
    return t('errors.validation_email');
  }
  if (
    isPhoneField &&
    (rawMsg.includes('invalid_libyan_phone') || rawMsg.toLowerCase().includes('libyan'))
  ) {
    return t('errors.validation_phone_ly');
  }
  if (field === 'password' && typ === 'string_too_short') {
    return t('errors.validation_password_short');
  }
  if (typ === 'missing' || typ === 'value_error.missing') {
    return t('errors.validation_required');
  }

  if (rawMsg.trim()) return rawMsg.trim();
  return t('errors.validation_generic');
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

/** Same as `fieldErrorsFromApiError` but uses localized validation copy where possible. */
export function fieldErrorsFromApiErrorLocalized(
  error: unknown,
  t: TFunction<'common'>,
): FieldErrorMap {
  if (!(error instanceof ValidationError)) return {};

  const out: FieldErrorMap = {};
  for (const item of validationItems(error.details)) {
    const path = fieldPathFromLoc(item.loc);
    if (!path) continue;
    out[path] = localizedValidationItemMessage(item, t);
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

const LEGACY_DETAIL_TO_API_KEY: Record<string, string> = {
  'Email already exists': 'email_already_exists',
  EmailAlreadyExists: 'email_already_exists',
  'Cannot post to a control (summary) account; use a leaf/posting account':
    'control_account_posting',
};

/**
 * User-facing API error text in the current UI language (stable backend codes,
 * FastAPI validation metadata, then fallbacks).
 */
export function getLocalizedApiErrorMessage(
  error: unknown,
  t: TFunction<'common'>,
  fallback?: string,
): string {
  const fb = fallback ?? t('errors.generic');

  if (error instanceof ApiError) {
    if (error.status === 409 && isRecord(error.details)) {
      const label = error.details.display_label;
      if (typeof label === 'string' && label.trim()) {
        const key = 'apiErrors.variant_inventory_activity' as const;
        const translated = t(key, { label: label.trim() });
        if (translated !== key) return translated;
      }
    }

    const machine = detailsMachineCode(error.details);
    if (machine && machine !== 'validation_error') {
      const key = `apiErrors.${machine}` as const;
      const translated = t(key);
      if (translated !== key) return translated;
    }

    const rawDetail = detailString(error.details);
    if (rawDetail) {
      const legacyKey = LEGACY_DETAIL_TO_API_KEY[rawDetail];
      if (legacyKey) {
        const key = `apiErrors.${legacyKey}` as const;
        const translated = t(key);
        if (translated !== key) return translated;
      }
      if (rawDetail.includes('_') && !rawDetail.includes(' ')) {
        const key = `apiErrors.${rawDetail}` as const;
        const translated = t(key);
        if (translated !== key) return translated;
      }
    }

    if (error instanceof ValidationError) {
      const items = validationItems(error.details);
      if (items.length > 0) {
        return localizedValidationItemMessage(items[0]!, t);
      }
      const vm = firstValidationMessage(error);
      if (vm) return vm;
    }

    if (error instanceof ServerError) return fb;
    if (error.message && error.message !== 'Request failed') return error.message;
    return fb;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fb;
}

export function applyApiErrorToForm<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  error: unknown,
): string | null {
  const tc = i18n.getFixedT(i18n.language, 'common');
  const fields = fieldErrorsFromApiErrorLocalized(error, tc);
  const entries = Object.entries(fields);

  for (const [path, message] of entries) {
    form.setError(
      path as Parameters<typeof form.setError>[0],
      { type: 'server', message },
      { shouldFocus: entries[0]?.[0] === path },
    );
  }

  if (entries.length > 0) return null;
  return getLocalizedApiErrorMessage(error, tc);
}

export function notifyApiError(error: unknown, fallback?: string): void {
  const tc = i18n.getFixedT(i18n.language, 'common');
  notify.error(getLocalizedApiErrorMessage(error, tc, fallback ?? tc('errors.generic')));
}
