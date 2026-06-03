import type { NavItem } from './navigation';

export const DASHBOARD_NAV_HREF = '/dashboard';

/** Leaf links (no nested children) for shortcut grids and home fallbacks. */
export function flattenNavLeaves(items: readonly NavItem[]): { href: string; labelKey: string }[] {
  const out: { href: string; labelKey: string }[] = [];
  for (const it of items) {
    if (it.children?.length) {
      for (const c of it.children) {
        if (c.href && !c.children?.length) {
          out.push({ href: c.href, labelKey: c.labelKey });
        }
      }
    } else if (it.href) {
      out.push({ href: it.href, labelKey: it.labelKey });
    }
  }
  return out;
}

/** Nav destinations other than the dashboard itself (for shortcuts and access checks). */
export function actionableNavLeaves(items: readonly NavItem[]) {
  return flattenNavLeaves(items).filter((leaf) => leaf.href !== DASHBOARD_NAV_HREF);
}

export function hasModuleNavAccess(items: readonly NavItem[]): boolean {
  return actionableNavLeaves(items).length > 0;
}

/** Hide the lone dashboard link when the user has no module permissions. */
export function filterNavForShell(items: readonly NavItem[]): NavItem[] {
  if (hasModuleNavAccess(items)) return [...items];
  return items.filter((it) => it.href !== DASHBOARD_NAV_HREF);
}
