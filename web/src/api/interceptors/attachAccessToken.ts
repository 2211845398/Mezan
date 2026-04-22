import type { InternalAxiosRequestConfig } from 'axios';

import { getAccessTokenSync } from '@/stores/authStore';

/**
 * Adds `Authorization: Bearer <token>` to every request when an access token
 * is available in the in-memory Zustand slice. Never reads from localStorage
 * — that is a deliberate W-7.1 security rule.
 */
export function attachAccessToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = getAccessTokenSync();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
}
