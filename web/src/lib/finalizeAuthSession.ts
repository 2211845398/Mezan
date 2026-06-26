import type { LoginResponse } from '@/api/types';
import { getMe } from '@/features/auth/api';
import type { AuthUser } from '@/features/auth/stores/authStore';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { applyFullAuthSession, applyRestrictedAuthSession } from '@/lib/authSessionHydrate';

/** Apply tokens + load identity after login or 2FA verify. */
export async function finalizeAuthSession(tokens: LoginResponse): Promise<{
  me: AuthUser;
  permSet: Set<string>;
  roleCodes: string[];
}> {
  const { setAccessToken, setRefreshToken } = useAuthStore.getState();

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('missing_tokens');
  }

  setAccessToken(tokens.access_token);
  setRefreshToken(tokens.refresh_token);

  const me = await getMe();
  if (me.must_change_password || tokens.must_change_password) {
    applyRestrictedAuthSession(me);
    return { me: me as AuthUser, permSet: new Set(), roleCodes: [] };
  }

  return applyFullAuthSession(me);
}
