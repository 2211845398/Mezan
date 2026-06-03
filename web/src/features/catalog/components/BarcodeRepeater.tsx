import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * v1: single primary barcode (matches backend `Product.barcode`).
 * "Add row" can duplicate the same field UX for future multi-barcode support.
 */
export type BarcodeRepeaterProps = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

export function BarcodeRepeater({ value, onChange, disabled }: BarcodeRepeaterProps) {
  const { t } = useTranslation('catalog');
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="product-barcode">{t('barcode.label')}</Label>
          <Input
            id="product-barcode"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            autoComplete="off"
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
