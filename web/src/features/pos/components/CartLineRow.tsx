import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';

import type { CartRead } from '../api';

export type CartLineRowProps = {
  line: NonNullable<CartRead['lines']>[number];
  currency: string;
  editable: boolean;
  onQtyChange: (productId: number, qty: number) => void;
};

export function CartLineRow({ line, currency, editable, onQtyChange }: CartLineRowProps) {
  const { t } = useTranslation('pos');

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border py-3 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium">{line.product_name || line.product_sku}</div>
        <div className="text-[11px] text-muted-foreground" dir="ltr">
          {formatCurrency(Number.parseFloat(line.unit_price), currency)} × {line.qty}
        </div>
      </div>
      <div className="grid w-28 grid-cols-[2rem_1fr_2rem] overflow-hidden rounded-md border">
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-none px-0"
          disabled={!editable}
          onClick={() => onQtyChange(line.product_id, Math.max(0, Number(line.qty) - 1))}
          aria-label="decrease"
        >
          -
        </Button>
        <Input
          type="number"
          min={0}
          className="min-h-11 rounded-none border-y-0 px-1 text-center"
          value={line.qty}
          disabled={!editable}
          aria-label={t('register.qty')}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 0) onQtyChange(line.product_id, n);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-none px-0"
          disabled={!editable}
          onClick={() => onQtyChange(line.product_id, Number(line.qty) + 1)}
          aria-label="increase"
        >
          +
        </Button>
      </div>
      <div className="w-28 text-end font-medium" dir="ltr">
        {formatCurrency(Number.parseFloat(line.line_total), currency)}
      </div>
    </div>
  );
}
