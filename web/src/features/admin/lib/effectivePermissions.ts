import type { PermissionRead, PermKey, UserPermissionOverrideRead } from '../types';

/**
 * Mirrors `get_current_user_permissions` in `app/api/deps.py`: role permission
 * ids → (resource, action) pairs, then apply allow/deny overrides globally.
 */
export function computeEffectivePermissionKeys(
  rolePermissionIdSets: Iterable<Iterable<number>>,
  permissionById: Map<number, PermissionRead>,
  overrides: UserPermissionOverrideRead[],
): Set<PermKey> {
  const effective = new Set<PermKey>();
  for (const idSet of rolePermissionIdSets) {
    for (const pid of idSet) {
      const p = permissionById.get(pid);
      if (p) effective.add(`${p.resource}:${p.action}` as PermKey);
    }
  }
  for (const o of overrides) {
    const p = permissionById.get(o.permission_id);
    if (!p) continue;
    const key = `${p.resource}:${p.action}` as PermKey;
    if (o.effect === 'deny') effective.delete(key);
    else effective.add(key);
  }
  return effective;
}
