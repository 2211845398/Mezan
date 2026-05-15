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
  onApplyDiscount: (code: string, amount: string) => Promise<void>;
  onCheckout: () => void | Promise<void>;
  onNewSale: () => void;
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
  onApplyDiscount,
  onCheckout,
  onNewSale,
}: RegisterTotalsColumnProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();

  const canOpenPay =
    online && canPay && canInvoice && (isLocked || (editable && canUpdateCart && cart.status === 'active'));

  return (
    <aside className="flex min-h-0 w-full min-w-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-3 shadow-sm lg:max-h-full">
      <CartTotals cart={cart} currency={currency} />

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
          className="min-h-12 w-full bg-[#82a2f7] text-base font-semibold text-white shadow-md shadow-blue-500/15 hover:bg-[#728fe0]"
          disabled={!canOpenPay}
          onClick={() => void onCheckout()}
        >
          {t('register.checkout')}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={onNewSale}>
          {t('register.new_cart')}
        </Button>
        {isLocked ? (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{t('register.locked')}</p>
        ) : null}
      </div>
    </aside>
  );
}
