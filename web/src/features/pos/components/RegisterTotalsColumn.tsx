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
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-3 shadow-sm lg:max-h-full">
      <div className="rounded-xl border bg-muted/20 px-3 py-3 text-center">
        <h2 className="text-xs font-medium text-muted-foreground">{t('register.total_panel')}</h2>
        <p className="text-xs text-muted-foreground">{t('register.total_panel_hint')}</p>
      </div>
      <CartTotals cart={cart} currency={currency} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          {canDiscount ? (
            <DiscountPicker
              disabled={!editable}
              onApply={onApplyDiscount}
              triggerClassName="min-h-11 w-full bg-[#82a2f7] text-white shadow-md shadow-blue-500/15 hover:bg-[#728fe0] hover:text-white"
            />
          ) : null}
          <Button
            type="button"
            className="min-h-11 w-full bg-[#8d83df] text-white shadow-md shadow-violet-500/15 hover:bg-[#7a70cf]"
            disabled={!editable}
            onClick={() => void onPark()}
          >
            {t('register.park')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={cart.status !== 'parked'}
            onClick={() => void onResume()}
          >
            {t('register.resume')}
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full bg-[#71c4aa] text-white shadow-md shadow-emerald-500/15 hover:bg-[#5fb397]"
            disabled={!editable || !canUpdateCart}
            onClick={() => void onLock()}
          >
            {t('register.lock_first')}
          </Button>
          <Button
            type="button"
            className="min-h-12 w-full bg-[#82a2f7] text-base font-semibold text-white shadow-md shadow-blue-500/15 hover:bg-[#728fe0]"
            disabled={!isLocked || !canPay || !canInvoice || !online}
            onClick={onCheckout}
          >
            {t('register.checkout')}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={onNewSale}>
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
    </aside>
  );
}
