import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useOnline } from '@/hooks/useOnline';

import type { CartRead, PosShiftOpen } from '../api';
import { CartTotals } from './CartTotals';
import { DiscountPicker } from './DiscountPicker';

export type RegisterTotalsColumnProps = {
  cart: CartRead;
  currency: string;
  shift: PosShiftOpen;
  terminalId: number;
  cartId: number;
  canDiscount: boolean;
  canUpdateCart: boolean;
  canPay: boolean;
  canInvoice: boolean;
  editable: boolean;
  isLocked: boolean;
  onApplyDiscount: (code: string, amount: string) => Promise<void>;
  onPark: () => Promise<unknown>;
  onResume: () => Promise<unknown>;
  onLock: () => Promise<unknown>;
  onCheckout: () => void;
  onNewSale: () => void;
};

export function RegisterTotalsColumn({
  cart,
  currency,
  shift,
  terminalId,
  cartId,
  canDiscount,
  canUpdateCart,
  canPay,
  canInvoice,
  editable,
  isLocked,
  onApplyDiscount,
  onPark,
  onResume,
  onLock,
  onCheckout,
  onNewSale,
}: RegisterTotalsColumnProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto lg:max-h-full">
      <CartTotals cart={cart} currency={currency} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {canDiscount ? (
            <DiscountPicker
              disabled={!editable}
              onApply={onApplyDiscount}
              triggerClassName="min-h-11"
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!editable}
            onClick={() => void onPark()}
          >
            {t('register.park')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={cart.status !== 'parked'}
            onClick={() => void onResume()}
          >
            {t('register.resume')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={!editable || !canUpdateCart}
            onClick={() => void onLock()}
          >
            {t('register.lock_first')}
          </Button>
          <Button
            type="button"
            className="min-h-12 min-w-[8rem] text-base font-semibold"
            disabled={!isLocked || !canPay || !canInvoice || !online}
            onClick={onCheckout}
          >
            {t('register.checkout')}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onNewSale}>
            {t('register.new_cart')}
          </Button>
        </div>
        {isLocked ? (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{t('register.locked')}</p>
        ) : null}
        <p className="text-[11px] text-muted-foreground" dir="ltr">
          shift #{shift.id} · terminal #{terminalId} · cart #{cartId}
        </p>
      </div>
    </div>
  );
}
