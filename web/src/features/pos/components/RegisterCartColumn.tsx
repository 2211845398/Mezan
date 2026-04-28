import { ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useOnline } from '@/hooks/useOnline';

import type { CartRead } from '../api';
import { CartLineRow } from './CartLineRow';

export type RegisterCartColumnProps = {
  cart: CartRead;
  editable: boolean;
  isLocked: boolean;
  onQtyChange: (productId: number, qty: number) => void;
  currency: string;
};

export function RegisterCartColumn({
  cart,
  editable,
  isLocked,
  onQtyChange,
  currency,
}: RegisterCartColumnProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm lg:min-h-[12rem]">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShoppingCart className="size-4" aria-hidden />
            {t('register.cart')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('register.cart_hint')}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {cart.lines?.length ?? 0}
        </span>
      </div>

      {!online ? (
        <p className="mx-4 mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t('shell.offline')}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#fcfbf8] p-3">
        {!cart.lines?.length ? (
          <div className="flex h-full min-h-44 flex-col items-center justify-center text-center text-muted-foreground">
            <ShoppingCart className="size-16 opacity-25" />
            <p className="mt-3 text-base font-medium">{t('register.cart_empty')}</p>
          </div>
        ) : (
          cart.lines.map((ln) => (
            <CartLineRow
              key={ln.id}
              line={ln}
              currency={currency}
              editable={!!editable}
              onQtyChange={onQtyChange}
            />
          ))
        )}
        {!editable && !isLocked ? (
          <p className="mt-2 text-xs text-muted-foreground">{t('register.cannot_edit')}</p>
        ) : null}
      </div>
    </div>
  );
}
