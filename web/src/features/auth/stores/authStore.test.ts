import { beforeEach, describe, expect, it } from 'vitest';

import { env } from '@/config/env';

import { getRefreshStorageKey, readRefreshTokenFromStorage, useAuthStore } from './authStore';

const KEY = env.VITE_SESSION_STORAGE_KEY_REFRESH;

describe('authStore refresh token storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useAuthStore.getState().clear();
    useAuthStore.setState({ status: 'unauthenticated' });
  });

  it('uses the configured storage key', () => {
    expect(getRefreshStorageKey()).toBe(KEY);
  });

  it('persists refresh token in localStorage', () => {
    useAuthStore.getState().setRefreshToken('refresh-abc');
    expect(window.localStorage.getItem(KEY)).toBe('refresh-abc');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-abc');
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('migrates legacy sessionStorage token to localStorage on read', () => {
    window.sessionStorage.setItem(KEY, 'legacy-token');
    expect(readRefreshTokenFromStorage()).toBe('legacy-token');
    expect(window.localStorage.getItem(KEY)).toBe('legacy-token');
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('clear removes refresh token from localStorage and sessionStorage', () => {
    useAuthStore.getState().setRefreshToken('to-clear');
    window.sessionStorage.setItem(KEY, 'stale');
    useAuthStore.getState().clear();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
