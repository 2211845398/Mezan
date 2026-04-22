import { create } from 'zustand';

/*
 * Access token is held in memory only — never in localStorage or sessionStorage.
 * This slice is a W-1 stub so interceptors can read from it today; W-2 wires
 * real login/refresh flows (see WEB_FRONTEND_PLAN §9.1).
 */

export type AuthState = {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  setAccessToken: (token) => set({ accessToken: token }),
  clear: () => set({ accessToken: null }),
}));

export function getAccessTokenSync(): string | null {
  return useAuthStore.getState().accessToken;
}

export function setAccessTokenSync(token: string | null): void {
  useAuthStore.getState().setAccessToken(token);
}

export function clearAuthSync(): void {
  useAuthStore.getState().clear();
}
