import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { MoneyInput } from '@/components/shared/form/MoneyInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import ReceiveLineReadonlyValue from './ReceiveLineReadonlyValue';

type Props = {
  variant: ReactNode;
  uomDisplay?: string;
  /** When set, replaces the read-only unit display (e.g. adhoc receipt UoM picker). */
  uomControl?: ReactNode;
  qty: string;
  unitCost: string;
  qtyMax?: number;
  disabled?: boolean;
  onQtyChange: (value: string) => void;
  onUnitCostChange: (value: string) => void;
  actions?: ReactNode;
  /** Shown under unit cost (e.g. per-base-unit conversion hint). */
  unitCostFooter?: ReactNode;
  /** Override label for unit cost column. */
  unitCostLabel?: string;
};

/** Single receive row: variant | qty | unit (read-only) | unit cost. */
export default function PoReceiveLineRow({
  variant,
  uomDisplay = '',
  uomControl,
  qty,
  unitCost,
  qtyMax,
  disabled,
  onQtyChange,
  onUnitCostChange,
  actions,
  unitCostFooter,
  unitCostLabel,
}: Props) {
  const { t } = useTranslation('purchasing');

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
      <div className="min-w-0 md:col-span-4">
        <Label>{t('orders.receive.variant')}</Label>
        {variant}
      </div>
      <div className="md:col-span-2">
        <Label>{t('orders.form.qty')}</Label>
        <Input
          className="h-9"
          type="number"
          min={0}
          max={qtyMax}
          disabled={disabled}
          value={qty}
          placeholder="0"
          onChange={(e) => onQtyChange(e.target.value)}
        />
      </div>
      <div className="min-w-0 md:col-span-2">
        <Label>{t('orders.form.unit')}</Label>
        {uomControl ?? <ReceiveLineReadonlyValue value={uomDisplay} />}
      </div>
      <div className={actions ? 'md:col-span-3' : 'md:col-span-4'}>
        <Label>{unitCostLabel ?? t('orders.receive.unit_cost')}</Label>
        <MoneyInput
          className="h-9"
          fractionDigits={4}
          disabled={disabled}
          value={unitCost}
          onChange={onUnitCostChange}
        />
        {unitCostFooter}
      </div>
      {actions ? (
        <div className="flex items-end justify-end md:col-span-1">{actions}</div>
      ) : null}
    </div>
  );
}
