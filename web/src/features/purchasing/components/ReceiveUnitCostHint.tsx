import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getProduct } from '@/features/catalog/api';
import { catalogKeys } from '@/features/catalog/queries';
import { buildProductUomOptions } from '@/features/purchasing/lib/productUomOptions';
import { formatMoney } from '@/lib/format';
import { selectedUomLabel, unitCostPerBaseUnit } from '@/lib/productUomCost';

type Props = {
  productId: number;
  uomId: number;
  unitCost: string;
};

/** Hint: entered cost per selected UoM converts to per-base-unit for inventory valuation. */
export default function ReceiveUnitCostHint({ productId, uomId, unitCost }: Props) {
  const { t } = useTranslation('inventory');
  const { t: tCatalog } = useTranslation('catalog');

  const { data: product } = useQuery({
    queryKey: catalogKeys.product(productId),
    queryFn: () => getProduct(productId),
    enabled: productId > 0 && uomId > 0,
  });

  const uomOptions = useMemo(
    () => (product ? buildProductUomOptions(tCatalog, product) : []),
    [product, tCatalog],
  );

  const baseCost = useMemo(
    () => (uomId > 0 ? unitCostPerBaseUnit(unitCost, uomId, uomOptions) : null),
    [unitCost, uomId, uomOptions],
  );

  if (!baseCost) return null;

  return (
    <span className="text-xs text-muted-foreground">
      {t('movement.receipt.unit_cost_base_hint', { amount: formatMoney(baseCost) })}
    </span>
  );
}

export function receiveUnitCostLabel(
  t: (key: string, opts?: Record<string, string>) => string,
  uomId: number,
  options: ReturnType<typeof buildProductUomOptions>,
): string {
  const uom = selectedUomLabel(uomId, options);
  return uom ? t('movement.receipt.unit_cost_per_uom', { uom }) : t('adjustments.field.unit_cost');
}
