import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getProduct } from '@/features/catalog/api';
import { catalogKeys } from '@/features/catalog/queries';
import PoLineVariantSelect from '@/features/purchasing/components/PoLineVariantSelect';
import PoLineUomSelect from '@/features/purchasing/components/PoLineUomSelect';
import { buildProductUomOptions } from '@/features/purchasing/lib/productUomOptions';
import { ProductSearch } from '@/features/pos/components/ProductSearch';

type Props = {
  productId: number | null;
  variantId: number | null;
  variantLabel: string;
  uomId: number;
  qty: string;
  onProductId: (id: number | null) => void;
  onVariant: (variantId: number | null, label: string) => void;
  onUomId: (uomId: number) => void;
  onQty: (qty: string) => void;
  disabled?: boolean;
  showVariant?: boolean;
  productClearable?: boolean;
  variantLabelMode?: 'optional' | 'variant' | 'none';
};

/** Product + optional variant + qty + UoM row for inventory movement pages. */
export default function InventoryProductLineFields({
  productId,
  variantId,
  variantLabel,
  uomId,
  qty,
  onProductId,
  onVariant,
  onUomId,
  onQty,
  disabled,
  showVariant = true,
  productClearable,
  variantLabelMode = 'optional',
}: Props) {
  const { t } = useTranslation('inventory');
  const { t: tCatalog } = useTranslation('catalog');

  const pid = productId ?? 0;
  const { data: product } = useQuery({
    queryKey: catalogKeys.product(pid),
    queryFn: () => getProduct(pid),
    enabled: pid > 0,
  });
  const uomOptions = useMemo(
    () => (product ? buildProductUomOptions(tCatalog, product) : []),
    [product, tCatalog],
  );

  useEffect(() => {
    if (uomOptions.length > 0) {
      onUomId(uomOptions[0]!.id);
    }
  }, [pid, uomOptions, onUomId]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
      <div className={showVariant ? 'min-w-0 md:col-span-4' : 'min-w-0 md:col-span-5'}>
        <Label>{t('adjustments.field.product')}</Label>
        <ProductSearch
          {...(productClearable ? { clearable: true } : {})}
          value={productId == null ? '' : String(productId)}
          onChange={(id) => {
            onProductId(id);
            onVariant(null, '');
          }}
          {...(disabled !== undefined ? { disabled } : {})}
        />
      </div>
      {showVariant ? (
        <div className="min-w-0 md:col-span-3">
          <PoLineVariantSelect
            compact
            labelMode={variantLabelMode}
            productId={pid}
            variantId={variantId}
            variantPickLabel={variantLabel}
            disabled={disabled || pid <= 0}
            {...(variantLabelMode === 'variant'
              ? { placeholder: t('movement.field.variant_placeholder') }
              : {})}
            onVariantPick={onVariant}
          />
        </div>
      ) : null}
      <div className="md:col-span-2">
        <Label>{t('adjustments.field.quantity')}</Label>
        <Input
          className="h-9"
          type="number"
          min={1}
          value={qty}
          disabled={disabled}
          onChange={(e) => onQty(e.target.value)}
        />
      </div>
      <div className="md:col-span-3">
        <Label>{t('movement.field.uom')}</Label>
        <PoLineUomSelect
          fullWidth
          disabled={disabled || pid <= 0 || uomOptions.length === 0}
          uomId={uomId}
          options={uomOptions}
          onChange={onUomId}
        />
      </div>
    </div>
  );
}
