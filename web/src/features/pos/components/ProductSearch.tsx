import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AsyncSelect, type SelectOption } from '@/components/shared/form/Select';
import type { ListProductsParams } from '@/features/catalog/queries';
import { useProducts } from '@/features/catalog/queries';

export type ProductSearchProps = {
  value: string | undefined;
  onChange: (productId: number | null) => void;
  disabled?: boolean;
  clearable?: boolean;
};

export function ProductSearch({ value, onChange, disabled, clearable }: ProductSearchProps) {
  const { t } = useTranslation('pos');
  const [q, setQ] = useState('');

  const params = useMemo((): ListProductsParams => {
    const base: ListProductsParams = { limit: 30, offset: 0 };
    const tq = q.trim();
    return tq ? { ...base, q: tq } : base;
  }, [q]);

  const { data, isFetching } = useProducts(params, { enabled: !disabled });

  const options: SelectOption[] = useMemo(
    () =>
      (data ?? []).map((p) => ({
        value: String(p.id),
        label: `${p.name} — ${p.sku}`,
      })),
    [data],
  );

  return (
    <AsyncSelect
      value={value}
      onChange={(next) => onChange(next ? Number.parseInt(next, 10) : null)}
      options={options}
      onSearch={setQ}
      placeholder={t('register.add_product')}
      searchPlaceholder={t('register.search_product')}
      emptyLabel={t('register.search_product')}
      isLoading={isFetching}
      className="min-h-11 w-full max-w-none"
      disabled={disabled ?? false}
      clearable={clearable}
    />
  );
}
