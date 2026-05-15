import { Clock3, ListChecks, ReceiptText, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

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

import { changeCartState } from '../api';
import { useParkedCarts } from '../queries';
import { ShiftCloseForm } from './ShiftCloseForm';

export type RegisterToolbarProps = {
  onReturnOpen: () => void;
  /** When set, register is in return-exchange flow for this invoice number (display only). */
  returnInvoiceNumber?: string | null;
  terminalId: number;
  branchLabel: string;
  currency: string;
  activeCartId: number | null;
  activeCartHasLines: boolean;
  onParkCurrent: () => Promise<unknown>;
  onResumeCart: (cartId: number) => void;
  parkedOpen: boolean;
  onParkedOpenChange: (open: boolean) => void;
};

/** Top toolbar for the register route. */
export function RegisterToolbar({
  onReturnOpen,
  returnInvoiceNumber,
  terminalId,
  branchLabel,
  currency,
  activeCartId,
  activeCartHasLines,
  onParkCurrent,
  onResumeCart,
  parkedOpen,
  onParkedOpenChange,
}: RegisterToolbarProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();
  const user = useAuthStore((s) => s.user);
  const [endShiftOpen, setEndShiftOpen] = useState(false);
  const [clock, setClock] = useState(() => now());
  const parked = useParkedCarts(terminalId);

  useEffect(() => {
    const id = window.setInterval(() => setClock(now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  async function handleResumeCart(cartId: number) {
    // Auto-park the active cart (if it has lines) before resuming the selected one
    if (activeCartId != null && activeCartHasLines) {
      await onParkCurrent();
    }
    onResumeCart(cartId);
    onParkedOpenChange(false);
  }

  async function handleDeleteParked(cartId: number) {
    await changeCartState(cartId, { action: 'cancel' });
    void parked.refetch();
  }

  return (
    <div className="flex w-full shrink-0 flex-wrap items-center gap-y-3 rounded-2xl border bg-card px-4 py-3 shadow-sm sm:gap-x-2">
      {/*
        One row: mirrors automatically between RTL and LTR.
        Group 1 (inline-start): title + branch → clock → today's sales → pending invoices.
        Flexible gap, then group 2 (inline-end): offline → user → return → end shift.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0 shrink">
          <p className="text-sm font-semibold leading-tight">{t('shell.title')}</p>
          <p className="text-xs text-muted-foreground">{branchLabel || `Terminal #${terminalId}`}</p>
          {returnInvoiceNumber ? (
            <p
              className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
              dir="ltr"
            >
              {t('return.mode_banner', { number: returnInvoiceNumber })}
            </p>
          ) : null}
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
          dir="ltr"
        >
          <Clock3 className="size-3.5" aria-hidden />
          {formatDateTime(clock, 'HH:mm:ss')}
        </span>
        <Button type="button" variant="outline" className="min-h-9 gap-2" asChild>
          <Link to="/pos/invoices">
            <ReceiptText className="size-4" aria-hidden />
            {t('register.todays_sales')}
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="relative min-h-9 gap-2"
          onClick={() => onParkedOpenChange(true)}
        >
          <ListChecks className="size-4" aria-hidden />
          {t('pending.title')}
          {(parked.data?.length ?? 0) > 0 ? (
            <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-0.5 text-[9px] font-black text-white">
              {parked.data?.length}
            </span>
          ) : null}
        </Button>
      </div>

      <div className="min-h-0 min-w-[1.5rem] flex-1 basis-0 max-sm:hidden" aria-hidden />

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:justify-between">
        <OfflineBadge online={online} />
        <span className="max-w-[12rem] truncate text-xs text-muted-foreground">
          {user?.full_name || user?.email}
        </span>
        <Button
          type="button"
          variant="outline"
          className="min-h-9 gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => onReturnOpen()}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('return.title')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 shrink-0 gap-2"
          onClick={() => setEndShiftOpen(true)}
        >
          {t('register.end_shift')}
        </Button>
      </div>

      {/* End-shift dialog */}
      <Dialog open={endShiftOpen} onOpenChange={setEndShiftOpen}>
        <DialogContent className="sm:max-w-md" dir="auto">
          <DialogHeader>
            <DialogTitle>{t('close.title')}</DialogTitle>
          </DialogHeader>
          <ShiftCloseForm onSuccess={() => setEndShiftOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Parked invoices dialog — controlled externally so totals column can also open it */}
      <Dialog open={parkedOpen} onOpenChange={onParkedOpenChange}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle>{t('pending.title')}</DialogTitle>
            <DialogDescription>{t('pending.description')}</DialogDescription>
          </DialogHeader>
          <div className="m-6 grid max-h-[calc(100dvh-14rem)] gap-3 overflow-y-auto">
            {parked.data?.length ? (
              parked.data.map((cart) => (
                <div
                  key={cart.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3 transition hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t('register.cart_unique_number', {
                        id: (cart as { daily_cart_number?: number }).daily_cart_number ?? cart.id,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cart.lines?.length ?? 0} {t('register.qty')} ·{' '}
                      {formatCurrency(Number(cart.total), currency)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleResumeCart(cart.id)}
                    >
                      {t('register.resume')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void handleDeleteParked(cart.id)}
                      aria-label={t('register.cancel_cart')}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                {parked.isLoading ? '…' : t('pending.empty')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
