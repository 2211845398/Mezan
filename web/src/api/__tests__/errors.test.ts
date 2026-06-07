import { describe, expect, it } from 'vitest';

import { fieldErrorsFromApiError, getApiErrorMessage, getLocalizedApiErrorMessage } from '@/api/errorMessages';
import {
  AuthenticationError,
  ConflictError,
  ExternalServiceError,
  NotAuthenticatedError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitedError,
  UnexpectedError,
  ValidationError,
} from '@/api/errors';
import { fieldErrorsFromValidationError, mapResponseToApiError } from '@/api/mapError';
import i18n from '@/i18n';

describe('mapResponseToApiError', () => {
  it('maps 401 with envelope to NotAuthenticatedError (alias AuthenticationError)', () => {
    const err = mapResponseToApiError(
      {
        status: 401,
        data: { error: { code: 'not_authenticated', message: 'nope' }, request_id: 'r1' },
      },
      null,
    );
    expect(err).toBeInstanceOf(NotAuthenticatedError);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.requestId).toBe('r1');
  });

  it('maps 403 to PermissionDeniedError', () => {
    const err = mapResponseToApiError(
      { status: 403, data: { error: { code: 'denied', message: 'Forbidden' } } },
      null,
    );
    expect(err).toBeInstanceOf(PermissionDeniedError);
  });

  it('maps 404 to NotFoundError', () => {
    const err = mapResponseToApiError(
      { status: 404, data: { error: { code: 'not_found', message: 'Missing' } } },
      null,
    );
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('maps 422 + details.errors to ValidationError', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'Invalid',
            details: {
              errors: [{ loc: ['body', 'email'], msg: 'invalid email', type: 'value_error' }],
            },
          },
        },
      },
      null,
    );
    expect(err).toBeInstanceOf(ValidationError);
    const fields = fieldErrorsFromValidationError(err);
    expect(fields.email).toBe('invalid email');
  });

  it('maps 409 to ConflictError', () => {
    const err = mapResponseToApiError(
      { status: 409, data: { error: { code: 'conflict', message: 'dup' } } },
      null,
    );
    expect(err).toBeInstanceOf(ConflictError);
  });

  it('maps 429 + Retry-After to RateLimitedError', () => {
    const err = mapResponseToApiError(
      {
        status: 429,
        headers: { 'retry-after': '42' },
        data: { error: { code: 'rate_limited', message: 'slow' } },
      },
      null,
    );
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).retryAfterSeconds).toBe(42);
  });

  it('maps 502 with envelope to ExternalServiceError', () => {
    const err = mapResponseToApiError(
      { status: 502, data: { error: { code: 'bad_gateway', message: 'gw' } } },
      null,
    );
    expect(err).toBeInstanceOf(ExternalServiceError);
  });

  it('maps 503 with envelope to ExternalServiceError', () => {
    const err = mapResponseToApiError(
      { status: 503, data: { error: { code: 'unavailable', message: 'x' } } },
      null,
    );
    expect(err).toBeInstanceOf(ExternalServiceError);
  });

  it('maps unknown 4xx to UnexpectedError', () => {
    const err = mapResponseToApiError(
      { status: 418, data: { error: { code: 'teapot', message: 'short' } } },
      null,
    );
    expect(err).toBeInstanceOf(UnexpectedError);
  });
});

describe('API error message extraction', () => {
  it('prefers duplicate email detail over generic request failed message', () => {
    const err = mapResponseToApiError(
      {
        status: 400,
        data: {
          error: {
            code: 'bad_request',
            message: 'Request failed',
            details: { detail: 'email_already_exists' },
          },
        },
      },
      null,
    );

    expect(getApiErrorMessage(err)).toBe('email_already_exists');
  });

  it('extracts FastAPI field validation messages and paths', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'Request failed',
            details: {
              errors: [
                {
                  loc: ['body', 'email'],
                  msg: "value is not a valid email address: invalid ','",
                  type: 'value_error',
                },
              ],
            },
          },
        },
      },
      null,
    );

    expect(getApiErrorMessage(err)).toContain('value is not a valid email address');
    expect(fieldErrorsFromApiError(err).email).toContain('value is not a valid email address');
  });

  it('localized duplicate email maps machine code in Arabic', () => {
    const err = mapResponseToApiError(
      {
        status: 400,
        data: {
          error: {
            code: 'bad_request',
            message: 'Request failed',
            details: { detail: 'email_already_exists' },
          },
        },
      },
      null,
    );
    const t = i18n.getFixedT('ar', 'common');
    expect(getLocalizedApiErrorMessage(err, t)).toBe(t('apiErrors.email_already_exists'));
  });

  it('localized validation maps email field to Arabic copy', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'Request failed',
            details: {
              errors: [
                {
                  loc: ['body', 'email'],
                  msg: "value is not a valid email address: invalid ','",
                  type: 'value_error',
                },
              ],
            },
          },
        },
      },
      null,
    );
    const t = i18n.getFixedT('ar', 'common');
    expect(getLocalizedApiErrorMessage(err, t)).toBe(t('errors.validation_email'));
  });

  it('falls back to a useful validation message for weak password errors', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'Request failed',
            details: {
              errors: [{ loc: ['body', 'password'], msg: 'Password is too weak', type: 'value_error' }],
            },
          },
        },
      },
      null,
    );

    expect(getApiErrorMessage(err)).toBe('Password is too weak');
    expect(fieldErrorsFromApiError(err).password).toBe('Password is too weak');
  });

  it('uses the fallback for server errors without actionable details', () => {
    const err = mapResponseToApiError(
      { status: 500, data: { error: { code: 'server_error', message: 'Internal Server Error' } } },
      null,
    );

    expect(getApiErrorMessage(err, 'Please try again.')).toBe('Please try again.');
  });

  it('localized control account GL message maps to Arabic copy', () => {
    const err = mapResponseToApiError(
      {
        status: 400,
        data: {
          error: {
            code: 'bad_request',
            message: 'Request failed',
            details: {
              detail:
                'Cannot post to a control (summary) account; use a leaf/posting account',
            },
          },
        },
      },
      null,
    );
    const t = i18n.getFixedT('ar', 'common');
    expect(getLocalizedApiErrorMessage(err, t)).toBe(t('apiErrors.control_account_posting'));
  });

  it('localized transfer stock error uses details.code in Arabic', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'Insufficient available stock at sending branch',
            details: {
              code: 'insufficient_transfer_stock',
              branch_id: 1,
              available: 2,
              requested: 10,
            },
          },
        },
      },
      null,
    );
    const tAr = i18n.getFixedT('ar', 'common');
    const tEn = i18n.getFixedT('en', 'common');
    expect(getLocalizedApiErrorMessage(err, tAr)).toBe(tAr('apiErrors.insufficient_transfer_stock'));
    expect(getLocalizedApiErrorMessage(err, tEn)).toBe(tEn('apiErrors.insufficient_transfer_stock'));
  });

  it('localizes stock_levels_negative by details.code', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'Stock levels cannot be negative',
            details: {
              code: 'stock_levels_negative',
              on_hand: -2,
              reserved: 0,
              damaged: 0,
            },
          },
        },
      },
      null,
    );
    const tAr = i18n.getFixedT('ar', 'common');
    expect(getLocalizedApiErrorMessage(err, tAr)).toBe(tAr('apiErrors.stock_levels_negative'));
  });

  it('falls back to generic copy when API message is untranslated', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'Some brand new backend sentence without a code',
            details: {},
          },
        },
      },
      null,
    );
    const t = i18n.getFixedT('ar', 'common');
    expect(getLocalizedApiErrorMessage(err, t)).toBe(t('errors.generic'));
  });

  it('translates opaque client validation codes', () => {
    const tAr = i18n.getFixedT('ar', 'common');
    const tEn = i18n.getFixedT('en', 'common');
    expect(getLocalizedApiErrorMessage(new Error('branch'), tAr)).toBe(
      tAr('clientValidation.branch_required'),
    );
    expect(getLocalizedApiErrorMessage(new Error('branch'), tEn)).toBe(
      tEn('clientValidation.branch_required'),
    );
  });

  it('returns pre-localized client error messages as-is', () => {
    const t = i18n.getFixedT('ar', 'common');
    const msg = 'أدخل اسم الحساب.';
    expect(getLocalizedApiErrorMessage(new Error(msg), t)).toBe(msg);
  });

  it('translates POS product sell price errors via legacy English message', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'Product has no sellable price',
            details: { product_id: 1, variant_id: 2 },
          },
        },
      },
      null,
    );
    const tAr = i18n.getFixedT('ar', 'common');
    const tEn = i18n.getFixedT('en', 'common');
    expect(getLocalizedApiErrorMessage(err, tAr)).toBe(tAr('apiErrors.product_no_sellable_price'));
    expect(getLocalizedApiErrorMessage(err, tEn)).toBe(tEn('apiErrors.product_no_sellable_price'));
  });

  it('translates POS product sell price errors via details.code', () => {
    const err = mapResponseToApiError(
      {
        status: 422,
        data: {
          error: {
            code: 'validation_error',
            message: 'المنتج ليس له سعر بيع محدد',
            details: {
              code: 'product_no_sellable_price',
              product_id: 4,
              variant_id: 6,
            },
          },
        },
      },
      null,
    );
    const tAr = i18n.getFixedT('ar', 'common');
    expect(getLocalizedApiErrorMessage(err, tAr)).toBe('المنتج ليس له سعر بيع محدد');
  });
});
