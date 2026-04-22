/**
 * Back-compat shim: the W-1 stub lived here; the real implementation moved
 * to `@/features/auth/stores/authStore` in W-2. This file re-exports so any
 * existing imports (Axios interceptors, tests) keep working without churn.
 * New code should import from `@/features/auth/stores/authStore` directly.
 */

export type { AuthState, AuthStatus, AuthUser } from '@/features/auth/stores/authStore';
export {
  clearAuthSync,
  getAccessTokenSync,
  getRefreshTokenSync,
  setAccessTokenSync,
  setRefreshTokenSync,
  useAuthStore,
} from '@/features/auth/stores/authStore';
