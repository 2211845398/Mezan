import type { InternalAxiosRequestConfig } from 'axios';

import i18n from '@/i18n';

/**
 * Mirrors the current i18n language onto the `Accept-Language` header so the
 * backend can localise error messages (when it chooses to). Defaults to `ar`.
 */
export function attachLocale(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const lng = i18n.language || 'ar';
  if (!config.headers.get('Accept-Language')) {
    config.headers.set('Accept-Language', lng);
  }
  return config;
}
