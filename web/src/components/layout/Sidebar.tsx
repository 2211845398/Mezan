import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { navigation, type NavItem } from '@/config/navigation';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { cn } from '@/lib/utils';

/*
 * Sidebar is driven by `config/navigation.ts` and filtered by the user's
 * effective permissions (W-2.4). A leaf is hidden when the user lacks its
 * permission; a parent group is hidden when every child is hidden. The
 * server is still authoritative — this is a UX affordance, not a security
 * boundary.
 */

function canAccess(
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

function filterNav(
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

function NavGroup({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(true);
  const Icon = item.icon;
  const label = t(item.labelKey);

  if (!item.children || item.children.length === 0) {
    return (
      <NavLink
        to={item.href}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
            isActive && 'bg-sidebar-primary text-sidebar-primary-foreground',
          )
        }
      >
        <Icon className="size-4" />
        <span>{label}</span>
      </NavLink>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <span className="flex items-center gap-3">
          <Icon className="size-4" />
          {label}
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <ul className="ms-6 space-y-1 border-s border-sidebar-border ps-2">
          {item.children.map((child) => (
            <li key={child.key}>
              <NavLink
                to={child.href}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md px-3 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
                    isActive && 'bg-sidebar-primary text-sidebar-primary-foreground',
                  )
                }
              >
                {t(child.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const permissions = useAuthStore((s) => s.permissions);
  const visible = React.useMemo(() => {
    const has = (resource: string, action: string) =>
      permissions.has(`${resource}:${action}`);
    return filterNav(navigation, has);
  }, [permissions]);

  return (
    <aside
      aria-label={t('layout.open_sidebar')}
      className="hidden w-64 shrink-0 border-e border-sidebar-border bg-sidebar lg:block"
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <span className="text-lg font-bold text-sidebar-foreground">{t('layout.app_name')}</span>
      </div>
      <nav className="space-y-1 p-3">
        {visible.map((item) => (
          <NavGroup key={item.key} item={item} />
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
