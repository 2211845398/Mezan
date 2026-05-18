import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AsyncSelect, type SelectOption } from '@/components/shared/form/Select';
import {
  type ProductVariantPurchasingSearchItem,
  searchProductVariantsForPurchasing,
} from '@/features/catalog/api';

export type VariantSearchSelectProps = {
  value: number | null;
  onChange: (variantId: number | null, item: ProductVariantPurchasingSearchItem | null) => void;
  disabled?: boolean;
};

export function VariantSearchSelect({ value, onChange, disabled }: VariantSearchSelectProps) {
  const { t } = useTranslation('inventory');
  const [q, setQ] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['inventory', 'product-variant-search', q],
    queryFn: () => searchProductVariantsForPurchasing({ q: q.trim(), limit: 50 }),
    enabled: !disabled,
    staleTime: 15_000,
  });

  const options: SelectOption[] = useMemo(
    () =>
      (data ?? []).map((v) => {
        const attr = v.variant_attributes?.trim();
        const label = attr ? `${v.display_name} — ${v.sku} (${attr})` : `${v.display_name} — ${v.sku}`;
        return { value: String(v.variant_id), label };
      }),
    [data],
  );

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
        onChange(Number.isFinite(vid) ? vid : null, item);
      }}
      options={options}
      onSearch={setQ}
      placeholder={t('transfers.variant_search_placeholder')}
      searchPlaceholder={t('transfers.variant_search_placeholder')}
      emptyLabel={t('transfers.variant_search_empty')}
      isLoading={isFetching}
      className="min-h-11 w-full max-w-none"
      disabled={disabled ?? false}
    />
  );
}
