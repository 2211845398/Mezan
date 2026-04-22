import { describe, expect, it } from 'vitest';

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
