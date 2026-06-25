import { PauseCircle, ShoppingCart, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useOnline } from '@/hooks/useOnline';

import type { CartDiscountBody, CartRead } from '../api';
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
  /** When true, primary action is «Register return» instead of checkout. */
  returnModeActive?: boolean;
  canRegisterReturn?: boolean;
  returnSubmitPending?: boolean;
  onRegisterReturn?: () => void | Promise<void>;
  /** Loyalty balance for the cart customer (detail API); null if no customer or not loaded. */
  customerLoyaltyBalance: number | null;
  onApplyDiscount: (body: CartDiscountBody) => Promise<void>;
  onCheckout: () => void | Promise<void>;
  onPark: () => void | Promise<void>;
  /** Park current sale and open a new empty cart (same as toolbar park + new). */
  onNewCart: () => void | Promise<void>;
  onClearCart: () => void | Promise<void>;
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
  returnModeActive = false,
  canRegisterReturn = false,
  returnSubmitPending = false,
  onRegisterReturn,
  customerLoyaltyBalance,
  onApplyDiscount,
  onCheckout,
  onPark,
  onNewCart,
  onClearCart,
}: RegisterTotalsColumnProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();

  const hasPayableLines = (cart.lines ?? []).some((ln) => (ln.qty ?? 0) > 0);

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
  const canClearCart = editable && cart.status === 'active' && hasPayableLines;

  return (
    <aside className="flex min-h-0 w-full min-w-0 flex-col gap-2.5 overflow-y-auto rounded-xl border bg-card p-2.5 shadow-sm lg:max-h-full">
      <CartTotals cart={cart} currency={currency} />

      <div className="flex flex-col gap-2">
        {canDiscount ? (
          <DiscountPicker
            disabled={!editable}
            customerLoyaltyBalance={customerLoyaltyBalance}
            onApply={onApplyDiscount}
            triggerClassName="min-h-11 w-full bg-primary text-primary-foreground shadow-md shadow-primary/15 hover:bg-primary/90 hover:text-primary-foreground"
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

        <Button
          type="button"
          variant="outline"
          className="min-h-10 w-full gap-1.5"
          disabled={!canPark}
          onClick={() => void onPark()}
        >
          <PauseCircle className="size-4" aria-hidden />
          {t('register.park_cart')}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="min-h-10 w-full gap-2 border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
          disabled={!canClearCart}
          onClick={() => void onClearCart()}
        >
          <Trash2 className="size-4" aria-hidden />
          {t('register.cancel_cart')}
        </Button>
      </div>
    </aside>
  );
}
