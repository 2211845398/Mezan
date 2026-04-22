import { useAuthStore } from '@/features/auth/stores/authStore';

/**
 * Returns `true` if the current user holds the given (`resource`, `action`)
 * pair in their effective permission set. Use for inline guards on buttons
 * and menu items; for whole-route guards see `<RequirePermission />`.
 */
export function usePermission(resource: string, action: string): boolean {
  return useAuthStore((s) => s.permissions.has(`${resource}:${action}`));
}
