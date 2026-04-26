import { useMemo } from 'react';

import { useAuthStore } from '@/features/auth/stores/authStore';

import { navigation, type NavItem } from './navigation';

export function canAccess(
  item: NavItem,
  has: (resource: string, action: string) => boolean,
): boolean {
  if (item.permission && !has(item.permission.resource, item.permission.action)) {
    return false;
  }
  if (item.children && item.children.length > 0) {
    return item.children.some((child) => canAccess(child, has));
  }
  return true;
}

export function filterNav(
  items: readonly NavItem[],
  has: (resource: string, action: string) => boolean,
): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (!canAccess(item, has)) continue;
    if (item.children && item.children.length > 0) {
      const children = filterNav(item.children, has);
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
  return useMemo(() => {
    const has = (resource: string, action: string) =>
      permissions.has(`${resource}:${action}`);
    return filterNav(navigation, has);
  }, [permissions]);
}
