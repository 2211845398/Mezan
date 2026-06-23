import type { TFunction } from 'i18next';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { ApiError, ServerError, ValidationError } from '@/api/errors';
import i18n from '@/i18n';
import { notify } from '@/lib/toast';

type BackendFieldError = {
  loc?: unknown;
  msg?: unknown;
  type?: unknown;
  code?: unknown;
  path?: unknown;
  field?: unknown;
  params?: unknown;
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
  const stableCode = typeof item.code === 'string' ? item.code : '';
  if (stableCode === 'required') return t('errors.validation_required');
  if (stableCode === 'invalid_email') return t('errors.validation_email');
  if (stableCode === 'min_length') return t('errors.validation_password_short');

  const pathField =
    typeof item.field === 'string' && item.field
      ? item.field
      : typeof item.path === 'string' && item.path
        ? item.path.split('.').pop() ?? ''
        : '';
  const loc = item.loc;
  const field =
    pathField ||
    (Array.isArray(loc) ? String(loc[loc.length - 1] ?? '') : '');
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

function fieldPathFromItem(item: BackendFieldError): string | null {
  if (typeof item.path === 'string' && item.path.trim()) return item.path.trim();
  return fieldPathFromLoc(item.loc);
}

export function fieldErrorsFromApiError(error: unknown): FieldErrorMap {
  if (!(error instanceof ValidationError)) return {};

  const out: FieldErrorMap = {};
  for (const item of validationItems(error.details)) {
    const path = fieldPathFromItem(item);
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
    const path = fieldPathFromItem(item);
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

const GENERIC_API_ERROR_CODES = new Set([
  'validation_error',
  'conflict',
  'resource_not_found',
  'invalid_state_transition',
  'permission_denied',
  'not_authenticated',
  'external_service_error',
  'bad_request',
  'http_error',
  'rate_limited',
  'internal_error',
]);

const LEGACY_MESSAGE_TO_API_KEY: Record<string, string> = {
  'Email already exists': 'email_already_exists',
  EmailAlreadyExists: 'email_already_exists',
  'Cannot post to a control (summary) account; use a leaf/posting account':
    'control_account_posting',
  'Insufficient available stock at sending branch': 'insufficient_transfer_stock',
  'Transfer line qty must be positive': 'transfer_qty_positive',
  'from_branch_id and to_branch_id must be different': 'transfer_same_branch',
  'Transfer batch requires at least one line': 'transfer_no_lines',
  'Batch has no lines': 'transfer_no_lines',
  'variant_id does not match product_id': 'transfer_variant_product_mismatch',
  'Batch must be pending_dispatch to dispatch': 'transfer_not_pending_dispatch',
  'Dispatch must be performed at the sending branch': 'transfer_dispatch_wrong_branch',
  'Batch must be in_transit to receive': 'transfer_not_in_transit',
  'Receipt must be performed at the receiving branch': 'transfer_receive_wrong_branch',
  'Only pending_dispatch transfers can be cancelled': 'transfer_cancel_not_pending',
  'Only pending_dispatch transfers can be updated': 'transfer_update_not_pending',
  'Cancellation must be performed at the sending branch': 'transfer_cancel_wrong_branch',
  'Transfer batch not found': 'transfer_batch_not_found',
  'Insufficient sellable stock': 'insufficient_sellable_stock',
  'Stock levels cannot be negative': 'stock_levels_negative',
  'reserved + damaged cannot exceed on_hand': 'stock_reserved_exceeds_on_hand',
  'All stock count lines must have counted quantity before posting': 'stock_count_incomplete_lines',
  'Cart not found': 'cart_not_found',
  'Cart is not active': 'cart_not_active',
  'Terminal not found': 'terminal_not_found',
  'Shift not found, does not belong to terminal, or is not open': 'shift_not_found',
  'Product not found': 'product_not_found',
  'Product has no sellable price': 'product_no_sellable_price',
  'Product has invalid sellable price': 'product_invalid_sellable_price',
  'This discount code is reserved for loyalty redemption': 'pos_discount_reserved',
  'This discount code is already applied to the cart': 'pos_discount_already_applied',
  'Cannot lock checkout for an empty cart': 'checkout_empty_cart',
  'Cannot park an empty cart': 'park_empty_cart',
  'Employee has no branch assigned': 'payroll_no_branch',
  'Employee has no weekly work schedule': 'payroll_no_schedule',
  'Either base_salary or hourly_rate (or hourly_rate_override) must be set to compute payroll':
    'payroll_no_pay_rate',
  'Net amount cannot be negative for this period (check attendance and absences)':
    'payroll_negative_net',
  'Net amount cannot be negative': 'payroll_negative_net',
  'Net amount cannot be negative after recalculation': 'payroll_negative_net',
};

const LEGACY_DETAIL_TO_API_KEY: Record<string, string> = {
  email_already_exists: 'email_already_exists',
};

/** Short opaque codes thrown by client-side form validation (not user-facing text). */
const OPAQUE_CLIENT_CODE = /^[a-z][a-z0-9_]*$/;

const CLIENT_VALIDATION_I18N: Record<string, string> = {
  branch: 'clientValidation.branch_required',
  lines: 'clientValidation.lines_required',
  unit_cost: 'clientValidation.unit_cost_required',
  fields: 'clientValidation.branch_and_product_required',
  'branch/product': 'clientValidation.branch_and_product_required',
  reason: 'clientValidation.reason_required',
  qty: 'clientValidation.qty_required',
  missing_po_branch: 'clientValidation.missing_po_branch',
  receive_lines_required: 'clientValidation.receive_lines_required',
  'branch and qty': 'clientValidation.receive_lines_required',
  unresolved_variant: 'clientValidation.unresolved_variant',
  session: 'clientValidation.session_unavailable',
  missing_batch: 'clientValidation.missing_batch',
};

function isOpaqueClientCode(message: string): boolean {
  return OPAQUE_CLIENT_CODE.test(message);
}

function translateClientValidationCode(t: TFunction<'common'>, code: string): string | null {
  const i18nKey = CLIENT_VALIDATION_I18N[code];
  if (!i18nKey) return null;
  const translated = t(i18nKey as 'clientValidation.branch_required');
  return translated !== i18nKey ? translated : null;
}

function translateApiErrorKey(t: TFunction<'common'>, key: string): string | null {
  const i18nKey = `apiErrors.${key}` as const;
  const translated = t(i18nKey);
  return translated !== i18nKey ? translated : null;
}

function devLogUntranslatedApiError(error: ApiError, raw: string): void {
  if (import.meta.env.DEV) {
    console.warn('[api] Untranslated error message', {
      code: error.code,
      detailsCode: detailsMachineCode(error.details),
      message: raw,
    });
  }
}

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
    if (machine) {
      const translated = translateApiErrorKey(t, machine);
      if (translated) return translated;
    }

    if (error.code && !GENERIC_API_ERROR_CODES.has(error.code)) {
      const translated = translateApiErrorKey(t, error.code);
      if (translated) return translated;
    }

    const rawDetail = detailString(error.details);
    if (rawDetail) {
      const legacyDetailKey = LEGACY_DETAIL_TO_API_KEY[rawDetail];
      if (legacyDetailKey) {
        const translated = translateApiErrorKey(t, legacyDetailKey);
        if (translated) return translated;
      }
      if (rawDetail.includes('_') && !rawDetail.includes(' ')) {
        const translated = translateApiErrorKey(t, rawDetail);
        if (translated) return translated;
      }
    }

    if (error instanceof ValidationError) {
      const items = validationItems(error.details);
      if (items.length > 0) {
        return localizedValidationItemMessage(items[0]!, t);
      }
      const vm = firstValidationMessage(error);
      if (vm) {
        const legacy = LEGACY_MESSAGE_TO_API_KEY[vm];
        if (legacy) {
          const translated = translateApiErrorKey(t, legacy);
          if (translated) return translated;
        }
      }
    }

    if (error instanceof ServerError) return fb;

    const rawMessage = error.message?.trim() ?? '';
    if (rawMessage && rawMessage !== 'Request failed') {
      const legacy = LEGACY_MESSAGE_TO_API_KEY[rawMessage];
      if (legacy) {
        const translated = translateApiErrorKey(t, legacy);
        if (translated) return translated;
      }
      devLogUntranslatedApiError(error, rawMessage);
    }
    return fb;
  }

  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim();
    const legacy = LEGACY_MESSAGE_TO_API_KEY[msg];
    if (legacy) {
      const translated = translateApiErrorKey(t, legacy);
      if (translated) return translated;
    }
    const clientValidation = translateClientValidationCode(t, msg);
    if (clientValidation) return clientValidation;
    if (!isOpaqueClientCode(msg)) return msg;
    if (import.meta.env.DEV) {
      console.warn('[api] Untranslated client error', msg);
    }
    return fb;
  }
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
