import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AsyncSelect } from '@/components/shared/form';
import { getProductWithVariants } from '@/features/catalog/api';

type Props = {
  productId: number;
  value: string;
  onChange: (variantId: number, label: string) => void;
  disabled?: boolean | undefined;
};

export default function PoReceiveVariantSelect({ productId, value, onChange, disabled }: Props) {
  const { t } = useTranslation('purchasing');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'product-variants', productId],
    queryFn: () => getProductWithVariants(productId),
    enabled: productId > 0,
  });

  const options = useMemo(() => {
    const variants = data?.variants ?? [];
    const q = search.trim().toLowerCase();
    return variants
      .filter((v) => {
        if (!q) return true;
        const sku = (v.sku ?? '').toLowerCase();
        const attrs = JSON.stringify(v.attribute_values ?? {}).toLowerCase();
        return sku.includes(q) || attrs.includes(q);
      })
      .map((v) => ({
        value: String(v.id),
        label: v.sku || `#${v.id}`,
      }));
  }, [data?.variants, search]);

  return (
    <AsyncSelect
      value={value || undefined}
      onChange={(next) => {
        const hit = data?.variants?.find((x) => String(x.id) === next);
        onChange(Number(next), hit?.sku ?? next);
      }}
      options={options}
      onSearch={setSearch}
      placeholder={t('orders.receive.variant_search_placeholder')}
      searchPlaceholder={t('orders.receive.variant_search_placeholder')}
      emptyLabel={t('orders.receive.variant_search_empty')}
      isLoading={isLoading}
      disabled={disabled}
    />
  );
}
