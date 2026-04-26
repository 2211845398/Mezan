import { PanelLeftClose, PanelRightClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useFilteredNavigation } from '@/config/navigationFilter';
import { useShellStore } from '@/stores/shellStore';
import { cn } from '@/lib/utils';

import { SidebarNav } from './SidebarNav';

/**
 * Desktop sidebar: RBAC-trimmed nav, optional collapsed icon rail, section
 * headers. Mobile navigation lives in `Topbar` + `Sheet`.
 */
export function Sidebar() {
  const { t, i18n } = useTranslation();
  const visible = useFilteredNavigation();
  const collapsed = useShellStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useShellStore((s) => s.toggleSidebarCollapsed);

  const CollapseIcon = i18n.dir() === 'rtl' ? PanelRightClose : PanelLeftClose;

  return (
    <aside
      aria-label={t('layout.open_sidebar')}
      className={cn(
        'hidden h-screen shrink-0 flex-col border-e border-sidebar-border bg-sidebar shadow-sm lg:flex',
        collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-sidebar-border px-4',
          collapsed && 'justify-center px-2',
        )}
      >
        {!collapsed ? (
          <span className="truncate text-lg font-bold text-primary">{t('layout.app_name')}</span>
        ) : (
          <span className="sr-only">{t('layout.app_name')}</span>
        )}
      </div>

      <SidebarNav items={visible} variant={collapsed ? 'collapsed' : 'expanded'} />

      <div className={cn('mt-auto shrink-0 border-t border-sidebar-border p-2', collapsed && 'px-1')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="w-full text-sidebar-foreground"
          onClick={() => toggleSidebarCollapsed()}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('layout.expand_sidebar') : t('layout.collapse_sidebar')}
        >
          <CollapseIcon className="size-5" />
        </Button>
      </div>
    </aside>
  );
}

export default Sidebar;
