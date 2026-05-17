import { ListChecks, PauseCircle, ShoppingCart, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useOnline } from '@/hooks/useOnline';

import type { CartRead } from '../api';
import { CartTotals } from './CartTotals';
import { DiscountPicker } from './DiscountPicker';

export type RegisterTotalsColumnProps = {
  cart: CartRead;
  currency: string;
  canDiscount: boolean;
  canUpdateCart: boolean;
  canPay: boolean;
  canInvoice: boolean;
  editable: boolean;
  isLocked: boolean;
  parkedCount: number;
  /** When true, primary action is «Register return» instead of checkout. */
  returnModeActive?: boolean;
  canRegisterReturn?: boolean;
  returnSubmitPending?: boolean;
  onRegisterReturn?: () => void | Promise<void>;
  onApplyDiscount: (code: string) => Promise<void>;
  onCheckout: () => void | Promise<void>;
  onPark: () => void | Promise<void>;
  /** Park current sale and open a new empty cart (same as toolbar park + new). */
  onNewCart: () => void | Promise<void>;
  onCancelCart: () => void | Promise<void>;
  onShowParked: () => void;
};

export function RegisterTotalsColumn({
  cart,
  currency,
  canDiscount,
  canUpdateCart,
  canPay,
  canInvoice,
  editable,
  isLocked,
  parkedCount,
  returnModeActive = false,
  canRegisterReturn = false,
  returnSubmitPending = false,
  onRegisterReturn,
  onApplyDiscount,
  onCheckout,
  onPark,
  onNewCart,
  onCancelCart,
  onShowParked,
}: RegisterTotalsColumnProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();

  const hasPayableLines = cart.lines.some((ln) => (ln.qty ?? 0) > 0);

  const canOpenPay =
    online &&
    canPay &&
    canInvoice &&
    hasPayableLines &&
    (isLocked || (editable && canUpdateCart && cart.status === 'active'));

  const primaryReturnEnabled =
    returnModeActive &&
    online &&
    Boolean(onRegisterReturn) &&
    canRegisterReturn &&
    !returnSubmitPending;

  const canPark = editable && cart.status === 'active' && hasPayableLines;
  const canNewCart = canPark;
  const canCancel = cart.status === 'active' || cart.status === 'parked' || cart.status === 'checkout_locked';

  return (
    <aside className="flex min-h-0 w-full min-w-0 flex-col gap-2.5 overflow-y-auto rounded-xl border bg-card p-2.5 shadow-sm lg:max-h-full">
      <CartTotals cart={cart} currency={currency} />

      <div className="flex flex-col gap-2">
        {canDiscount ? (
          <DiscountPicker
            disabled={!editable}
            onApply={onApplyDiscount}
            triggerClassName="min-h-11 w-full bg-[#82a2f7] text-white shadow-md shadow-blue-500/15 hover:bg-[#728fe0] hover:text-white"
          />
        ) : null}

        {/* Pay or Register return — same primary affordance */}
        <Button
          type="button"
          className="min-h-12 w-full bg-primary text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
          disabled={returnModeActive ? !primaryReturnEnabled : !canOpenPay}
          onClick={() =>
            returnModeActive && onRegisterReturn ? void onRegisterReturn() : void onCheckout()
          }
        >
          {returnModeActive ? t('return.submit') : t('register.checkout')}
        </Button>

        {isLocked ? (
          <p className="text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {t('register.locked')}
          </p>
        ) : null}
      </div>

      {/* Bottom secondary actions */}
      <div className="mt-auto flex flex-col gap-2 border-t pt-3">
        {/* View parked — full width with badge */}
        <Button
          type="button"
          variant="outline"
          className="relative min-h-10 w-full gap-2"
          onClick={onShowParked}
        >
          <ListChecks className="size-4" aria-hidden />
          {t('register.view_parked')}
          {parkedCount > 0 ? (
            <span className="absolute end-2 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-300/35 dark:text-emerald-950">
              {parkedCount}
            </span>
          ) : null}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="min-h-10 w-full gap-2"
          disabled={!canNewCart}
          onClick={() => void onNewCart()}
        >
          <ShoppingCart className="size-4" aria-hidden />
          {t('register.new_cart')}
        </Button>

        {/* Park + Delete row */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-10 gap-1.5"
            disabled={!canPark}
            onClick={() => void onPark()}
          >
            <PauseCircle className="size-4" aria-hidden />
            {t('register.park_cart')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-10 gap-1.5 text-destructive hover:bg-destructive/5 hover:text-destructive"
            disabled={!canCancel}
            onClick={() => void onCancelCart()}
          >
            <Trash2 className="size-4" aria-hidden />
            {cart.status === 'checkout_locked' ? t('register.exit_checkout') : t('register.cancel_cart')}
          </Button>
        </div>
      </div>
    </aside>
  );
}
