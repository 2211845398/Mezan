import { navigation, type NavItem } from './navigation';

type TitleEntry = { href: string; labelKey: string };

function walkCollect(items: readonly NavItem[], out: TitleEntry[]): void {
  for (const item of items) {
    if (item.children?.length) {
      walkCollect(item.children, out);
    }
    if (item.href) {
      out.push({ href: item.href, labelKey: item.labelKey });
    }
  }
}

const TITLE_INDEX: TitleEntry[] = [];
walkCollect(navigation, TITLE_INDEX);

/**
 * Longest-prefix match on `pathname` for a nav `href` (e.g. `/catalog/products`
 * wins over `/catalog`). Falls back to `layout.page` when unknown.
 */
export function getTitleKeyForPath(pathname: string): string {
  let bestLen = -1;
  let bestKey = 'layout.page';
  for (const { href, labelKey } of TITLE_INDEX) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (href.length > bestLen) {
        bestLen = href.length;
        bestKey = labelKey;
      }
    }
  }
  return bestKey;
}
