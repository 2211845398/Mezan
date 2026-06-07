import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AsyncSelect } from '@/components/shared/form';
import { searchProductVariantsForPurchasing } from '@/features/catalog/api';
import { purchasingVariantSearchLabel } from '@/features/catalog/lib/purchasingVariantLabel';

type Props = {
  productId: number;
  value: string;
  onChange: (variantId: number, label: string) => void;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  title?: string | undefined;
  pricedOnly?: boolean | undefined;
};

export default function PoReceiveVariantSelect({
  productId,
  value,
  onChange,
  disabled,
  placeholder,
  title,
  pricedOnly = false,
}: Props) {
  const { t } = useTranslation('purchasing');
  const [search, setSearch] = useState('');
  const [lastPickedLabel, setLastPickedLabel] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'product-variants-search', productId, search, pricedOnly],
    queryFn: () =>
      searchProductVariantsForPurchasing({
        product_id: productId,
        q: search,
        limit: 200,
        priced_only: pricedOnly || undefined,
      }),
    enabled: productId > 0,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!value) {
      setLastPickedLabel('');
    }
  }, [value]);

  const options = useMemo(
    () =>
      (data ?? []).map((v) => ({
        value: String(v.variant_id),
        label: purchasingVariantSearchLabel(v),
      })),
    [data],
  );

  const displayLabel = value && lastPickedLabel ? lastPickedLabel : undefined;

  return (
    <div className="min-w-0" title={title}>
      <AsyncSelect
        value={value || undefined}
        onChange={(next) => {
          if (!next) {
            setLastPickedLabel('');
            onChange(0, '');
            return;
          }
          const hit = (data ?? []).find((x) => String(x.variant_id) === next);
          const label = hit ? purchasingVariantSearchLabel(hit) : next;
          setLastPickedLabel(label);
          onChange(Number(next), label);
        }}
        options={options}
        onSearch={setSearch}
        placeholder={placeholder ?? t('orders.receive.variant_search_placeholder')}
        searchPlaceholder={t('orders.receive.variant_search_placeholder')}
        emptyLabel={t('orders.receive.variant_search_empty')}
        isLoading={isLoading}
        disabled={disabled}
        className="h-9 w-full"
        clearable={!disabled}
        displayLabel={displayLabel}
        clearAriaLabel={t('orders.form.variant_clear')}
      />
    </div>
  );
}
