import { describe, expect, it } from 'vitest';

import { fieldErrorsFromApiError, getApiErrorMessage } from '@/api/errorMessages';
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
            details: { detail: 'Email already exists' },
          },
        },
      },
      null,
    );

    expect(getApiErrorMessage(err)).toBe('Email already exists');
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
});
