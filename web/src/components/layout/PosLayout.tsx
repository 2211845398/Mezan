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
    'inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'bg-secondary/60 text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground',
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
    <div className="flex h-screen w-screen flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-lg font-bold tracking-tight text-primary">{t('shell.brand')}</span>
            <span className="text-xs font-medium text-muted-foreground">{t('shell.title')}</span>
          </div>
          <nav className="flex flex-wrap items-center gap-2" aria-label={t('shell.nav_label')}>
            <NavLink to="/pos" end className={navClass}>
              {t('shell.nav_gate')}
            </NavLink>
            <NavLink to="/pos/register" className={navClass}>
              {t('shell.nav_register')}
            </NavLink>
            <NavLink to="/pos/close" className={navClass}>
              {t('shell.nav_close')}
            </NavLink>
            <NavLink to="/pos/invoices" className={navClass}>
              {t('shell.nav_invoices')}
            </NavLink>
          </nav>
          <div className="flex flex-wrap items-center justify-end gap-3">
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
