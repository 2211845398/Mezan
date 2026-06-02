import { queryClient } from '@/api/queryClient';
import { env } from '@/config/env';
import { logout as logoutApi } from '@/features/auth/api';
import {
  clearAuthSync,
  getRefreshStorageKey,
  getRefreshTokenSync,
} from '@/features/auth/stores/authStore';
import { usePosRegisterStore } from '@/features/pos/stores/posRegisterStore';
import { usePosTerminalStore } from '@/features/pos/stores/posTerminalStore';
import { useShellStore } from '@/stores/shellStore';

const POS_TERMINAL_KEY = 'mezan.pos.active_terminal_id';
const POS_OFFLINE_QUEUE_KEY = 'mezan.pos.offline.queue';

/** Remove all Mezan-prefixed keys from browser storage (preserves i18n, etc.). */
export function purgeMezanBrowserStorage(): void {
  if (typeof window === 'undefined') return;
  const refreshKey = getRefreshStorageKey();
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith('mezan.') || key === refreshKey) {
        window.localStorage.removeItem(key);
      }
    }
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith('mezan.') || key === refreshKey) {
        window.sessionStorage.removeItem(key);
      }
    }
    // Explicit known keys (in case prefix scan missed)
    window.localStorage.removeItem(POS_TERMINAL_KEY);
    window.localStorage.removeItem(POS_OFFLINE_QUEUE_KEY);
    window.localStorage.removeItem(refreshKey);
    window.localStorage.removeItem(env.VITE_SESSION_STORAGE_KEY_REFRESH);
    window.sessionStorage.removeItem(refreshKey);
    window.sessionStorage.removeItem(env.VITE_SESSION_STORAGE_KEY_REFRESH);
  } catch {
    // private mode / quota
  }
}

/** Reset client-side session state after logout or auth expiry. */
export function resetClientSessionState(): void {
  queryClient.clear();
  clearAuthSync();
  usePosTerminalStore.getState().setActiveTerminalId(null);
  usePosRegisterStore.getState().setActiveCartId(null);
  useShellStore.setState({ mobileNavOpen: false });
  purgeMezanBrowserStorage();
}

/**
 * Best-effort server logout + full client cleanse.
 * Safe to call from Topbar, AuthBoundary, or interceptors.
 */
export async function signOutSession(): Promise<void> {
  const token = getRefreshTokenSync();
  try {
    if (token) await logoutApi({ refresh_token: token });
  } catch {
    // Revoke locally regardless of backend reachability.
  } finally {
    resetClientSessionState();
  }
}
