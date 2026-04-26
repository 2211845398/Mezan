import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@/lib/format';

import type { CartRead } from '../api';

export type CartTotalsProps = {
  cart: CartRead;
  currency: string;
};

export function CartTotals({ cart, currency }: CartTotalsProps) {
  const { t } = useTranslation('pos');

  const row = (label: string, amount: string, bold?: boolean) => (
    <div
      className={`flex justify-between gap-4 text-sm ${bold ? 'font-semibold' : ''}`}
      dir="ltr"
    >
      <span className="text-muted-foreground">{label}</span>
      <span>{formatCurrency(Number.parseFloat(amount), currency)}</span>
    </div>
  );

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
      {row(t('register.subtotal'), cart.subtotal)}
      {row(t('register.discount'), cart.discount_total)}
      {row(t('register.tax'), cart.tax_total)}
      {row(t('register.total'), cart.total, true)}
      <div className="pt-1 text-[11px] text-muted-foreground">
        {t('register.status')}: {cart.status}
      </div>
    </div>
  );
}
