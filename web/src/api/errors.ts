/*
 * Typed API errors mapped from the backend envelope:
 *   { error: { code, message, details }, request_id }
 *
 * Each UI error type carries the request_id so it can be shown in toast /
 * support copy. Interceptors throw these; feature hooks branch on `instanceof`.
 */

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiErrorInit = {
  status: number;
  requestId?: string | undefined;
  payload?: ApiErrorPayload | undefined;
  cause?: unknown;
};

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId: string | undefined;
  public readonly details: unknown;

  constructor(message: string, init: ApiErrorInit) {
    super(message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.payload?.code ?? `http_${init.status}`;
    this.requestId = init.requestId;
    this.details = init.payload?.details;
  }
}

export class NotAuthenticatedError extends ApiError {
  constructor(init: ApiErrorInit) {
    super(init.payload?.message ?? 'Not authenticated', init);
    this.name = 'NotAuthenticatedError';
  }
}

export class PermissionDeniedError extends ApiError {
  constructor(init: ApiErrorInit) {
    super(init.payload?.message ?? 'Permission denied', init);
    this.name = 'PermissionDeniedError';
  }
}

export class ValidationError extends ApiError {
  constructor(init: ApiErrorInit) {
    super(init.payload?.message ?? 'Validation failed', init);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends ApiError {
  constructor(init: ApiErrorInit) {
    super(init.payload?.message ?? 'Conflict', init);
    this.name = 'ConflictError';
  }
}

export class RateLimitedError extends ApiError {
  public readonly retryAfterSeconds: number | null;

  constructor(init: ApiErrorInit & { retryAfterSeconds: number | null }) {
    super(init.payload?.message ?? 'Rate limited', init);
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

export class ExternalServiceError extends ApiError {
  constructor(init: ApiErrorInit) {
    super(init.payload?.message ?? 'Upstream service error', init);
    this.name = 'ExternalServiceError';
  }
}

export class ServerError extends ApiError {
  constructor(init: ApiErrorInit) {
    super(init.payload?.message ?? 'Server error', init);
    this.name = 'ServerError';
  }
}

export class NotFoundError extends ApiError {
  constructor(init: ApiErrorInit) {
    super(init.payload?.message ?? 'Not found', init);
    this.name = 'NotFoundError';
  }
}

export class UnexpectedError extends ApiError {
  constructor(init: ApiErrorInit) {
    super(init.payload?.message ?? 'Unexpected error', init);
    this.name = 'UnexpectedError';
  }
}

export function is4xx(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500;
}

export function is5xx(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 500 && err.status < 600;
}

/** Same constructor as `NotAuthenticatedError` (shared `instanceof`). */
export { NotAuthenticatedError as AuthenticationError };
