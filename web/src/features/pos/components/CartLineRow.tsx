import { useTranslation } from 'react-i18next';

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
      <div className="w-24">
        <Input
          type="number"
          min={1}
          className="min-h-11"
          value={line.qty}
          disabled={!editable}
          aria-label={t('register.qty')}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 1) onQtyChange(line.product_id, n);
          }}
        />
      </div>
      <div className="w-28 text-end font-medium" dir="ltr">
        {formatCurrency(Number.parseFloat(line.line_total), currency)}
      </div>
    </div>
  );
}
