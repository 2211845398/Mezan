import type { NavItem } from './navigation';

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
