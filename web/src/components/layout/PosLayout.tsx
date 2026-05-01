import { Clock3, Menu, ReceiptText } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { OfflineBadge } from '@/components/shared/OfflineBadge';
import { usePendingOps } from '@/features/pos/hooks/usePendingOps';
import { flushPosOfflineQueue } from '@/features/pos/offline/flushQueue';
import { useOnline } from '@/hooks/useOnline';
import { cn } from '@/lib/utils';

/*
 * POS runs full-screen, deliberately outside `AdminLayout`.
 * Chrome is self-contained in `web/` (brand strip + primary nav).
 */

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
    isActive
      ? 'bg-muted text-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
  );

export default function PosLayout() {
  const { t } = useTranslation('pos');
  const online = useOnline();
  const pending = usePendingOps();

  useEffect(() => {
    if (online) {
      void flushPosOfflineQueue();
    }
  }, [online]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#f8f7f4]">
      <header className="shrink-0 border-b border-border bg-background/95">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Menu className="size-4 text-muted-foreground" aria-hidden />
            <span className="truncate text-sm font-semibold text-foreground">{t('shell.title')}</span>
          </div>
          <nav
            className="flex items-center gap-1 rounded-lg bg-background"
            aria-label={t('shell.nav_label')}
          >
            <NavLink to="/pos" end className={navClass}>
              <Clock3 className="size-4" aria-hidden />
              {t('shell.nav_gate')}
            </NavLink>
            <NavLink to="/pos/register" className={navClass}>
              <ReceiptText className="size-4" aria-hidden />
              {t('shell.nav_register')}
            </NavLink>
            <NavLink to="/pos/close" className={navClass}>
              {t('shell.nav_close')}
            </NavLink>
            <NavLink to="/pos/invoices" className={navClass}>
              {t('shell.nav_invoices')}
            </NavLink>
          </nav>
          <div className="flex min-w-0 items-center justify-end gap-3">
            <OfflineBadge online={online} />
            {pending > 0 ? (
              <span className="max-w-[14rem] text-xs text-amber-800 dark:text-amber-300">
                {t('shell.pending_sync', { count: pending })}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
