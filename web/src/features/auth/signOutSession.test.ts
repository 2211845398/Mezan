import { beforeEach, describe, expect, it } from 'vitest';

import { queryClient } from '@/api/queryClient';

import { purgeMezanBrowserStorage, resetClientSessionState } from './signOutSession';
import { useAuthStore } from './stores/authStore';

const POS_TERMINAL_KEY = 'mezan.pos.active_terminal_id';
const POS_OFFLINE_QUEUE_KEY = 'mezan.pos.offline.queue';

describe('signOutSession client reset', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useAuthStore.getState().clear();
    queryClient.clear();
  });

  it('purgeMezanBrowserStorage removes mezan-prefixed keys', () => {
    window.localStorage.setItem(POS_TERMINAL_KEY, '3');
    window.localStorage.setItem(POS_OFFLINE_QUEUE_KEY, '[]');
    window.localStorage.setItem('i18nextLng', 'ar');
    purgeMezanBrowserStorage();
    expect(window.localStorage.getItem(POS_TERMINAL_KEY)).toBeNull();
    expect(window.localStorage.getItem(POS_OFFLINE_QUEUE_KEY)).toBeNull();
    expect(window.localStorage.getItem('i18nextLng')).toBe('ar');
  });

  it('resetClientSessionState clears query cache and auth', () => {
    useAuthStore.getState().setRefreshToken('tok');
    queryClient.setQueryData(['auth', 'me'], { id: 1 });
    resetClientSessionState();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(queryClient.getQueryData(['auth', 'me'])).toBeUndefined();
  });
});
