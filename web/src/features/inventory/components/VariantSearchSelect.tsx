import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AsyncSelect, type SelectOption } from '@/components/shared/form/Select';
import {
  type ProductVariantPurchasingSearchItem,
  searchProductVariantsForPurchasing,
} from '@/features/catalog/api';
import { purchasingVariantSearchLabel } from '@/features/catalog/lib/purchasingVariantLabel';

export type VariantSearchSelectProps = {
  value: number | null;
  onChange: (variantId: number | null, item: ProductVariantPurchasingSearchItem | null) => void;
  attributeValueId?: number | null;
  disabled?: boolean;
};

export function VariantSearchSelect({ value, onChange, attributeValueId, disabled }: VariantSearchSelectProps) {
  const { t } = useTranslation('inventory');
  const [q, setQ] = useState('');
  const [lastPicked, setLastPicked] = useState<ProductVariantPurchasingSearchItem | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['inventory', 'product-variant-search', q, attributeValueId ?? null],
    queryFn: () =>
      searchProductVariantsForPurchasing({
        q: q.trim(),
        limit: 50,
        ...(attributeValueId != null ? { attribute_value_id: attributeValueId } : {}),
      }),
    enabled: !disabled,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (value == null) {
      setLastPicked(null);
    }
  }, [value]);

  const options: SelectOption[] = useMemo(
    () =>
      (data ?? []).map((v) => ({
        value: String(v.variant_id),
        label: purchasingVariantSearchLabel(v),
      })),
    [data],
  );

  const displayLabel =
    value != null && lastPicked?.variant_id === value
      ? purchasingVariantSearchLabel(lastPicked)
      : undefined;

  return (
    <AsyncSelect
      value={value == null ? undefined : String(value)}
      onChange={(next) => {
        if (!next) {
          onChange(null, null);
          return;
        }
        const vid = Number.parseInt(next, 10);
        const item = (data ?? []).find((x) => x.variant_id === vid) ?? null;
        if (item) {
          setLastPicked(item);
        }
        onChange(Number.isFinite(vid) ? vid : null, item);
      }}
      options={options}
      onSearch={setQ}
      placeholder={t('transfers.variant_search_placeholder')}
      searchPlaceholder={t('transfers.variant_search_placeholder')}
      emptyLabel={t('transfers.variant_search_empty')}
      isLoading={isFetching}
      className="h-9 w-full max-w-none"
      disabled={disabled ?? false}
      clearable
      displayLabel={displayLabel}
      clearAriaLabel={t('transfers.variant_clear')}
    />
  );
}
