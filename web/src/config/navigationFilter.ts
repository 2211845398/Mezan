import { useMemo } from 'react';

import { useAuthStore } from '@/features/auth/stores/authStore';

import { isPersonalLeaveBlocked } from './roleNavAccess';
import { filterNavForShell } from './navigationLeaves';
import { navigation, type NavItem } from './navigation';

function isRoleDenied(item: NavItem, roleCodes: readonly string[]): boolean {
  if (!item.denyRoleCodes?.length) return false;
  const have = new Set(roleCodes.map((c) => String(c).toUpperCase()));
  return item.denyRoleCodes.some((c) => have.has(String(c).toUpperCase()));
}

export function canAccess(
  item: NavItem,
  has: (resource: string, action: string) => boolean,
  roleCodes: readonly string[] = [],
): boolean {
  if (isRoleDenied(item, roleCodes)) return false;
  if (item.permission && !has(item.permission.resource, item.permission.action)) {
    return false;
  }
  if (item.children && item.children.length > 0) {
    return item.children.some((child) => canAccess(child, has, roleCodes));
  }
  return true;
}

export function filterNav(
  items: readonly NavItem[],
  has: (resource: string, action: string) => boolean,
  roleCodes: readonly string[] = [],
): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (!canAccess(item, has, roleCodes)) continue;
    if (item.children && item.children.length > 0) {
      const children = filterNav(item.children, has, roleCodes);
      if (children.length === 0) continue;
      out.push({ ...item, children });
    } else {
      out.push(item);
    }
  }
  return out;
}

/** RBAC-trimmed nav tree for shell components (sidebar, mobile sheet). */
export function useFilteredNavigation(): NavItem[] {
  const permissions = useAuthStore((s) => s.permissions);
  const roleCodes = useAuthStore((s) => s.roleCodes);
  return useMemo(() => {
    const has = (resource: string, action: string) =>
      permissions.has(`${resource}:${action}`);
    return filterNav(navigation, has, roleCodes);
  }, [permissions, roleCodes]);
}

export { isPersonalLeaveBlocked };

/** Sidebar / mobile nav: drops dashboard when it is the only visible item. */
export function useShellNavigation(): NavItem[] {
  const visible = useFilteredNavigation();
  return useMemo(() => filterNavForShell(visible), [visible]);
}
