import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOnline } from '@/hooks/useOnline';

import type { CartRead } from '../api';
import { CartLineRow } from './CartLineRow';
import { CustomerPicker } from './CustomerPicker';
import { ProductSearch } from './ProductSearch';

export type RegisterCartColumnProps = {
  cart: CartRead;
  editable: boolean;
  isLocked: boolean;
  productPick: string | undefined;
  onProductPickChange: (id: string | undefined) => void;
  lineQty: number;
  onLineQtyChange: (qty: number) => void;
  onAddLine: () => void;
  addLineDisabled: boolean;
  onQtyChange: (productId: number, qty: number) => void;
  currency: string;
};

export function RegisterCartColumn({
  cart,
  editable,
  isLocked,
  productPick,
  onProductPickChange,
  lineQty,
  onLineQtyChange,
  onAddLine,
  addLineDisabled,
  onQtyChange,
  currency,
}: RegisterCartColumnProps) {
  const { t } = useTranslation('pos');
  const online = useOnline();

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-hidden lg:min-h-[12rem]">
      {!online ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t('shell.offline')}
        </p>
      ) : null}

      <CustomerPicker />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-[min(100%,18rem)]">
          <ProductSearch
            value={productPick}
            onChange={(id) => onProductPickChange(id != null ? String(id) : undefined)}
            disabled={!editable}
          />
        </div>
        <div className="w-24 shrink-0">
          <label className="text-xs text-muted-foreground">{t('register.qty')}</label>
          <Input
            type="number"
            min={1}
            className="min-h-11"
            value={lineQty}
            disabled={!editable}
            onChange={(e) => onLineQtyChange(Number.parseInt(e.target.value, 10) || 1)}
          />
        </div>
        <Button
          type="button"
          className="min-h-11 shrink-0"
          onClick={() => void onAddLine()}
          disabled={addLineDisabled}
        >
          {t('register.add_product')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card/50 p-3">
        {!cart.lines?.length ? (
          <p className="text-sm text-muted-foreground">{t('register.cart')}</p>
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
