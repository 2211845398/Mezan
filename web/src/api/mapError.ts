import type { AxiosError } from 'axios';

import {
  type ApiError,
  type ApiErrorInit,
  type ApiErrorPayload,
  ConflictError,
  ExternalServiceError,
  NotAuthenticatedError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitedError,
  ServerError,
  UnexpectedError,
  ValidationError,
} from '@/api/errors';

export type BackendEnvelope = {
  error?: Partial<ApiErrorPayload> & { code?: string; message?: string; details?: unknown };
  request_id?: string;
};

export function extractPayload(
  envelope: BackendEnvelope | undefined,
  fallbackCode: string,
): ApiErrorPayload {
  const e = envelope?.error;
  return {
    code: e?.code ?? fallbackCode,
    message: e?.message ?? 'Request failed',
    details: e?.details,
  };
}

export function parseRetryAfterHeader(raw: string | undefined): number | null {
  if (!raw) return null;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return null;
}

export type ResponseLike = {
  status: number;
  data?: BackendEnvelope | undefined;
  headers?: Record<string, string | string[] | undefined>;
};

function headerString(
  headers: ResponseLike['headers'] | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const v = headers[name] ?? headers[name.toLowerCase() as keyof typeof headers];
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Pure mapping from HTTP response + envelope → typed `ApiError` subclass (no side effects).
 */
export function mapResponseToApiError(response: ResponseLike, cause: unknown): ApiError {
  const data = response.data;
  const requestId =
    headerString(response.headers, 'x-request-id') ??
    (data && typeof data === 'object' && 'request_id' in data
      ? String((data as BackendEnvelope).request_id)
      : undefined);
  const status = response.status;
  const payload = extractPayload(data, `http_${status}`);
  const init: ApiErrorInit = { status, requestId, payload, cause };

  switch (status) {
    case 401:
      return new NotAuthenticatedError(init);
    case 403:
      return new PermissionDeniedError(init);
    case 404:
      return new NotFoundError(init);
    case 422:
    case 400:
      return new ValidationError(init);
    case 409:
      return new ConflictError(init);
    case 429: {
      const retryAfterSeconds = parseRetryAfterHeader(
        headerString(response.headers, 'retry-after'),
      );
      return new RateLimitedError({ ...init, retryAfterSeconds });
    }
    case 502:
    case 503:
    case 504:
      return new ExternalServiceError(init);
    default:
      if (status >= 500) {
        return new ServerError(init);
      }
      return new UnexpectedError(init);
  }
}

export function notAuthenticatedFromAxios(error: AxiosError): NotAuthenticatedError {
  const response = error.response;
  if (!response) {
    return new NotAuthenticatedError({ status: 401, cause: error });
  }
  const mapped = mapResponseToApiError(
    {
      status: response.status,
      data: response.data as BackendEnvelope | undefined,
      headers: response.headers as Record<string, string | string[] | undefined>,
    },
    error,
  );
  if (mapped instanceof NotAuthenticatedError) {
    return mapped;
  }
  return new NotAuthenticatedError({
    status: 401,
    requestId: mapped.requestId,
    payload: { code: mapped.code, message: mapped.message, details: mapped.details },
    cause: error,
  });
}

type ValidationDetailItem = { loc?: unknown; msg?: unknown };

/** Maps FastAPI-style `details.errors[]` into RHF `setError` field paths. */
export function fieldErrorsFromValidationError(err: ValidationError): Record<string, string> {
  const details = err.details;
  if (!details || typeof details !== 'object') return {};
  const raw = (details as { errors?: unknown }).errors;
  if (!Array.isArray(raw)) return {};

  const out: Record<string, string> = {};
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { loc, msg } = item as ValidationDetailItem;
    if (typeof msg !== 'string' || !Array.isArray(loc)) continue;
    const path = loc
      .filter((x) => typeof x === 'string' && x !== 'body')
      .join('.');
    if (path) out[path] = msg;
  }
  return out;
}
