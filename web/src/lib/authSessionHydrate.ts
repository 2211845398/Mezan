import { queryClient } from '@/api/queryClient';
import { getMe, getMyPermissions, getMyRoles, type UserRead } from '@/features/auth/api';
import {
  type AuthUser,
  useAuthStore,
} from '@/features/auth/stores/authStore';
import { hydrateAuthAndPrefetchShell, hydrateAuthQueryCache } from '@/lib/shellPrefetch';

/** Authenticated session limited to password-change routes (no RBAC load). */
export function applyRestrictedAuthSession(me: UserRead): void {
  const { setUser, setPermissions, setRoleCodes, setStatus } = useAuthStore.getState();
  hydrateAuthQueryCache(queryClient, me, []);
  setUser(me as AuthUser);
  setPermissions([]);
  setRoleCodes([]);
  setStatus('authenticated');
}

/** Full session after password change or normal login. */
export async function applyFullAuthSession(me?: UserRead): Promise<{
  me: AuthUser;
  permSet: Set<string>;
  roleCodes: string[];
}> {
  const resolved = me ?? (await getMe());
  const [perms, roles] = await Promise.all([getMyPermissions(), getMyRoles()]);
  await hydrateAuthAndPrefetchShell(resolved, perms);
  const { setUser, setPermissions, setRoleCodes, setStatus } = useAuthStore.getState();
  setUser(resolved as AuthUser);
  setPermissions(perms);
  setRoleCodes(roles.codes);
  setStatus('authenticated');

  const permSet = new Set(perms.map((p) => `${p.resource}:${p.action}`));
  return { me: resolved as AuthUser, permSet, roleCodes: roles.codes };
}
