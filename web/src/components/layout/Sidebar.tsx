import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { navigation, type NavItem } from '@/config/navigation';
import { cn } from '@/lib/utils';

/*
 * Sidebar is driven by `config/navigation.ts`. The `permission` field is
 * metadata only in W-1 — RBAC trimming lands in W-2.4. All spacing uses
 * logical Tailwind utilities (ms/me/ps/pe/start/end) so switching `dir`
 * from rtl to ltr flips the layout without any CSS changes.
 *
 * Links render as plain `<a>` in W-1; W-2.1 swaps them for React Router
 * `NavLink` once the router is introduced.
 */

function NavGroup({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(true);
  const Icon = item.icon;
  const label = t(item.labelKey);

  if (!item.children || item.children.length === 0) {
    return (
      <a
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
        )}
      >
        <Icon className="size-4" />
        <span>{label}</span>
      </a>
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
              <a
                href={child.href}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
                )}
              >
                {t(child.labelKey)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t('layout.open_sidebar')}
      className="hidden w-64 shrink-0 border-e border-sidebar-border bg-sidebar lg:block"
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <span className="text-lg font-bold text-sidebar-foreground">{t('layout.app_name')}</span>
      </div>
      <nav className="space-y-1 p-3">
        {navigation.map((item) => (
          <NavGroup key={item.key} item={item} />
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
