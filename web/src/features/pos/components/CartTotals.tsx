import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@/lib/format';

import type { CartRead } from '../api';

export type CartTotalsProps = {
  cart: CartRead;
  currency: string;
};

export function CartTotals({ cart, currency }: CartTotalsProps) {
  const { t, i18n } = useTranslation('pos');
  /** Arabic: label on the inline-start side (visually right), amounts on the left; English unchanged (label left, amount right). */
  const summaryDir = i18n.language.startsWith('ar') ? 'rtl' : 'ltr';

  const row = (label: string, amount: string, bold?: boolean) => (
    <div
      className={`flex justify-between gap-4 ${bold ? 'text-2xl font-bold' : 'text-sm'}`}
      dir={summaryDir}
    >
      <span className="text-muted-foreground">{label}</span>
      <span dir="ltr">{formatCurrency(Number.parseFloat(amount), currency)}</span>
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 shadow-inner">
      {row(t('register.subtotal'), cart.subtotal)}
      {row(t('register.discount'), cart.discount_total)}
      {row(t('register.tax'), cart.tax_total)}
      <div className="h-px bg-border" />
      {row(t('register.total'), cart.total, true)}
    </div>
  );
}
