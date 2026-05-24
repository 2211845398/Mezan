import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import PoReceiveVariantSelect from './PoReceiveVariantSelect';

type Props = {
  productId: number;
  variantId: number | null;
  variantPickLabel: string;
  disabled?: boolean;
  compact?: boolean;
  /** `optional` = PO label; `variant` = inventory label; `none` = hide label. */
  labelMode?: 'optional' | 'variant' | 'none';
  onVariantPick: (variantId: number | null, label: string) => void;
};

export default function PoLineVariantSelect({
  productId,
  variantId,
  variantPickLabel,
  disabled,
  compact = false,
  labelMode = 'optional',
  onVariantPick,
}: Props) {
  const { t } = useTranslation('purchasing');
  const { t: tInv } = useTranslation('inventory');

  const hasVariant = variantId != null && variantId > 0;
  const productReady = productId > 0;

  if (!compact && !productReady) return null;

  const labelText =
    labelMode === 'variant'
      ? tInv('movement.field.variant')
      : labelMode === 'optional'
        ? t('orders.form.variant_optional')
        : null;

  const labelRow =
    labelText == null ? null : compact ? (
      <Label className="text-sm font-medium">{labelText}</Label>
    ) : (
      <Label className="text-xs font-normal text-muted-foreground">{labelText}</Label>
    );

  const selectControl = productReady ? (
    <PoReceiveVariantSelect
      productId={productId}
      value={hasVariant ? String(variantId) : ''}
      disabled={disabled}
      placeholder={t('orders.form.variant_optional_placeholder')}
      title={hasVariant && variantPickLabel ? variantPickLabel : undefined}
      onChange={(id, label) => onVariantPick(id, label)}
    />
  ) : (
    <div
      className="flex h-9 w-full items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground"
      aria-hidden
    >
      —
    </div>
  );

  if (compact) {
    return (
      <div className="grid min-w-0 gap-2">
        {labelRow}
        {selectControl}
      </div>
    );
  }

  if (labelRow == null) {
    return <div className="mt-2 space-y-1">{selectControl}</div>;
  }

  return (
    <div className="mt-2 space-y-1">
      {labelRow}
      {selectControl}
      {variantPickLabel && hasVariant ? (
        <p className="text-xs text-muted-foreground">{variantPickLabel}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('orders.form.lines_variant_hint')}</p>
      )}
    </div>
  );
}
