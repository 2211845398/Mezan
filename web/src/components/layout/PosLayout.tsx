import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router-dom';

import { OfflineBadge } from '@/components/shared/OfflineBadge';
import { usePendingOps } from '@/features/pos/hooks/usePendingOps';
import { flushPosOfflineQueue } from '@/features/pos/offline/flushQueue';
import { useOnline } from '@/hooks/useOnline';

/*
 * POS runs full-screen, deliberately outside `AdminLayout`.
 */

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
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
          <span>{t('shell.title')}</span>
          <nav className="flex flex-wrap gap-2">
            <Link className="text-primary underline-offset-4 hover:underline" to="/pos">
              {t('shell.nav_gate')}
            </Link>
            <Link className="text-primary underline-offset-4 hover:underline" to="/pos/register">
              {t('shell.nav_register')}
            </Link>
            <Link className="text-primary underline-offset-4 hover:underline" to="/pos/close">
              {t('shell.nav_close')}
            </Link>
            <Link className="text-primary underline-offset-4 hover:underline" to="/pos/invoices">
              {t('shell.nav_invoices')}
            </Link>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OfflineBadge online={online} />
          {pending > 0 ? (
            <span className="text-[11px] text-amber-700 dark:text-amber-400">
              {t('shell.pending_sync', { count: pending })}
            </span>
          ) : null}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
