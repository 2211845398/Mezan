import { create } from 'zustand';

import { env } from '@/config/env';
import { syncUiLanguageFromAccount } from '@/lib/syncUiLanguageFromAccount';

/*
 * Single source of truth for auth state.
 *
 * - `accessToken` lives in memory only (W-7.1 rule from
 *   `WEB_FRONTEND_PLAN.md` §9.1).
 * - `refreshToken` lives in `localStorage` (shared across tabs on the same
 *   origin) until httpOnly cookies land; legacy `sessionStorage` values are
 *   migrated on read. See `web/SECURITY.md` and `DIVERGENCES.md` D-1.
 * - `permissions` is a `Set<"resource:action">` for O(1) `<Can />` lookups.
 * - `user` and `branch` are pulled from /auth/me after login and refresh.
 * - `status` drives the boot/login UI (boot loader, login page, ready shell).
 */

export type AuthUser = {
  id: number;
  email: string;
  first_name: string | null;
  father_name: string | null;
  family_name: string | null;
  status: string;
  branch_id: number | null;
  branch_name?: string | null;
  phone: string | null;
  city: string | null;
  preferred_language: string | null;
  avatar_url: string | null;
  last_login_at: string | null;
  employee_profile_id?: number | null;
};

export type AuthStatus = 'idle' | 'booting' | 'authenticated' | 'unauthenticated';

export type AuthState = {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  permissions: Set<string>;
  /**
   * Distinct role codes from `/auth/me/roles` (e.g. `OWNER`, `HR_MANAGER`).
   * Used for coarse UI gates alongside fine-grained `permissions`.
   */
  roleCodes: string[];
  /**
   * Flips to `true` only after `/auth/me/permissions` has resolved (on boot
   * or login). Guards treat `permissionsLoaded === false` as "still loading"
   * and render the loader instead of `/403` — fixes W-2 bug 2.
   */
  permissionsLoaded: boolean;
  activeBranchId: number | null;
  /** Increment after avatar image changes so `<img>` URLs bypass browser cache for same path. */
  avatarCacheBust: number;

  setStatus: (status: AuthStatus) => void;
  setAccessToken: (token: string | null) => void;
  setRefreshToken: (token: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setPermissions: (pairs: ReadonlyArray<{ resource: string; action: string }>) => void;
  setRoleCodes: (codes: ReadonlyArray<string>) => void;
  setActiveBranchId: (id: number | null) => void;
  hasPermission: (resource: string, action: string) => boolean;
  bumpAvatarCacheBust: () => void;
  clear: () => void;
};

function permissionKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

function refreshStorageKey(): string {
  return env.VITE_SESSION_STORAGE_KEY_REFRESH;
}

/** Key used for refresh JWT in `localStorage` (exported for cross-tab listeners). */
export function getRefreshStorageKey(): string {
  return refreshStorageKey();
}

/** Reads refresh JWT from storage (migrates legacy `sessionStorage` once). */
export function readRefreshTokenFromStorage(): string | null {
  try {
    const key = refreshStorageKey();
    let token = localStorage.getItem(key);
    if (!token) {
      const legacy = sessionStorage.getItem(key);
      if (legacy) {
        localStorage.setItem(key, legacy);
        sessionStorage.removeItem(key);
        token = legacy;
      }
    }
    return token;
  } catch {
    return null;
  }
}

function writeRefreshToStorage(token: string | null): void {
  try {
    const key = refreshStorageKey();
    if (token === null) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } else {
      localStorage.setItem(key, token);
      sessionStorage.removeItem(key);
    }
  } catch {
    // storage unavailable (private mode, SSR): tolerate silently.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  accessToken: null,
  refreshToken: readRefreshTokenFromStorage(),
  user: null,
  permissions: new Set<string>(),
  roleCodes: [],
  permissionsLoaded: false,
  activeBranchId: null,
  avatarCacheBust: 0,

  setStatus: (status) => set({ status }),
  setAccessToken: (token) => set({ accessToken: token }),
  setRefreshToken: (token) => {
    writeRefreshToStorage(token);
    set({ refreshToken: token });
  },
  setUser: (user) => {
    set({
      user,
      activeBranchId: user?.branch_id ?? get().activeBranchId,
    });
    if (user) syncUiLanguageFromAccount(user.preferred_language);
  },
  setPermissions: (pairs) => {
    const set_ = new Set<string>();
    for (const p of pairs) {
      set_.add(permissionKey(p.resource, p.action));
    }
    set({ permissions: set_, permissionsLoaded: true });
  },
  setRoleCodes: (codes) => set({ roleCodes: [...codes] }),
  setActiveBranchId: (id) => set({ activeBranchId: id }),
  hasPermission: (resource, action) => get().permissions.has(permissionKey(resource, action)),
  bumpAvatarCacheBust: () => set((s) => ({ avatarCacheBust: s.avatarCacheBust + 1 })),
  clear: () => {
    writeRefreshToStorage(null);
    set({
      status: 'unauthenticated',
      accessToken: null,
      refreshToken: null,
      user: null,
      permissions: new Set<string>(),
      roleCodes: [],
      permissionsLoaded: false,
      activeBranchId: null,
      avatarCacheBust: 0,
    });
  },
}));

// --- Non-React accessors (used by Axios interceptors at request time) ---

export function getAccessTokenSync(): string | null {
  return useAuthStore.getState().accessToken;
}

export function setAccessTokenSync(token: string | null): void {
  useAuthStore.getState().setAccessToken(token);
}

export function getRefreshTokenSync(): string | null {
  return useAuthStore.getState().refreshToken;
}

export function setRefreshTokenSync(token: string | null): void {
  useAuthStore.getState().setRefreshToken(token);
}

export function clearAuthSync(): void {
  useAuthStore.getState().clear();
}
