import { Clock3, ListChecks, LogOut, ReceiptText, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { OfflineBadge } from '@/components/shared/OfflineBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useOnline } from '@/hooks/useOnline';
import { now } from '@/lib/date';
import { formatCurrency, formatDateTime } from '@/lib/format';

import { useParkedCarts } from '../queries';
import { ShortcutsHelp } from './ShortcutsHelp';

export type RegisterToolbarProps = {
  onReturnOpen: () => void;
  terminalId: number;
  branchLabel: string;
  currency: string;
  activeCartId: number | null;
  onParkCurrent: () => Promise<unknown>;
  onResumeCart: (cartId: number) => void;
};

/** Top actions on the register route (quick nav + return + shortcuts). */
export function RegisterToolbar({
  onReturnOpen,
  terminalId,
  branchLabel,
  currency,
  activeCartId,
  onParkCurrent,
  onResumeCart,
}: RegisterToolbarProps) {
  const { t } = useTranslation('pos');
  const navigate = useNavigate();
  const online = useOnline();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [clock, setClock] = useState(() => now());
  const parked = useParkedCarts(terminalId);

  useEffect(() => {
    const id = window.setInterval(() => setClock(now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  async function newInvoiceFromCurrent() {
    if (activeCartId != null) {
      await onParkCurrent();
    }
    setPendingOpen(false);
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('shell.title')}</p>
          <p className="text-xs text-muted-foreground">{branchLabel || `Terminal #${terminalId}`}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground" dir="ltr">
          <Clock3 className="size-3.5" aria-hidden />
          {formatDateTime(clock, 'HH:mm:ss')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ShortcutsHelp />
        <Button type="button" variant="outline" className="min-h-9 gap-2" onClick={() => setPendingOpen(true)}>
          <ListChecks className="size-4" aria-hidden />
          {t('pending.title')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-9 gap-2 border-orange-300 text-orange-700 hover:bg-muted hover:text-orange-800"
          onClick={() => onReturnOpen()}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('return.title')}
        </Button>
        <Button type="button" variant="outline" className="min-h-9 gap-2" asChild>
          <Link to="/pos/invoices">
            <ReceiptText className="size-4" aria-hidden />
            مبيعات اليوم
          </Link>
        </Button>
        <OfflineBadge online={online} />
        <span className="text-xs text-muted-foreground">{user?.full_name || user?.email}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => {
            clearAuth();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut className="size-4" aria-hidden />
          خروج
        </Button>
      </div>
      <Dialog open={pendingOpen} onOpenChange={setPendingOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle>{t('pending.title')}</DialogTitle>
            <DialogDescription>{t('pending.description')}</DialogDescription>
          </DialogHeader>
          <div className="m-6 grid max-h-[calc(100dvh-14rem)] gap-3 overflow-y-auto">
            <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3">
              <div>
                <p className="text-sm font-medium">فاتورة جديدة</p>
                <p className="text-xs text-muted-foreground">يركن الفاتورة الحالية ثم يجهزك لفاتورة جديدة.</p>
              </div>
              <Button type="button" onClick={() => void newInvoiceFromCurrent()}>
                فاتورة جديدة
              </Button>
            </div>
            {parked.data?.length ? (
              parked.data.map((cart) => (
                <button
                  key={cart.id}
                  type="button"
                  className="flex items-center justify-between rounded-xl border bg-background p-3 text-start transition hover:bg-muted/50"
                  onClick={() => {
                    onResumeCart(cart.id);
                    setPendingOpen(false);
                  }}
                >
                  <div>
                    <p className="font-medium">
                      فاتورة #{(cart as { daily_cart_number?: number }).daily_cart_number ?? cart.id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cart.lines?.length ?? 0} أصناف · {formatCurrency(Number(cart.total), currency)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">فتح</span>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                {parked.isLoading ? '...' : t('pending.empty')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
