import axios, { type AxiosError, type AxiosInstance, isAxiosError as _isAxiosError } from 'axios';

import { env } from '@/config/env';

import { attachAccessToken } from './interceptors/attachAccessToken';
import { attachLocale } from './interceptors/attachLocale';
import { attachRequestId } from './interceptors/attachRequestId';
import { installHandle5xx } from './interceptors/handle5xx';
import { installHandle401Refresh } from './interceptors/handle401Refresh';
import { installHandle403 } from './interceptors/handle403';
import { installHandleRateLimit } from './interceptors/handleRateLimit';
import { installMapErrorEnvelope } from './interceptors/mapErrorEnvelope';

/*
 * One Axios instance for the whole app. Interceptors are composed here in a
 * deliberate order so error handling flows like a waterfall:
 *
 *   request:  attachAccessToken → attachRequestId → attachLocale
 *   response: 401 refresh → 403 → rate limit → 5xx retry → map envelope
 *
 * `no-restricted-imports` forbids importing the bare `axios` package anywhere
 * else; feature `api.ts` files import this instance.
 */

export function createApiClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: env.VITE_API_BASE_URL,
    withCredentials: true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  instance.interceptors.request.use(attachAccessToken);
  instance.interceptors.request.use(attachRequestId);
  instance.interceptors.request.use(attachLocale);

  installHandle401Refresh(instance);
  installHandle403(instance);
  installHandleRateLimit(instance);
  installHandle5xx(instance);
  installMapErrorEnvelope(instance);

  return instance;
}

export const apiClient: AxiosInstance = createApiClient();

/**
 * Re-export of Axios's `isAxiosError` through the client module so feature
 * code can branch on network errors without importing `axios` directly
 * (which is forbidden by ESLint `no-restricted-imports`).
 */
export function isAxiosError(value: unknown): value is AxiosError {
  return _isAxiosError(value);
}
