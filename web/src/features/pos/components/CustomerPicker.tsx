import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AsyncSelect, type SelectOption } from '@/components/shared/form/Select';
import { listCustomers } from '@/features/crm/api';
import { crmKeys } from '@/features/crm/queries';
import { notify } from '@/lib/toast';

export type CustomerPickerProps = {
  value?: number | null;
  disabled?: boolean;
  onChange: (customerId: number | null) => Promise<void>;
};

export function CustomerPicker({ value, disabled, onChange }: CustomerPickerProps) {
  const [q, setQ] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: crmKeys.customersPosPickerSearch(q),
    queryFn: () => {
      const search = q.trim();
      return listCustomers({
        ...(search ? { search } : {}),
        limit: 20,
        offset: 0,
      });
    },
    enabled: !disabled,
  });

  const options: SelectOption[] = useMemo(
    () =>
      (data?.items ?? []).map((customer) => ({
        value: String(customer.id),
        label: `${customer.full_name || customer.phone} · ${customer.phone}`,
      })),
    [data],
  );

  return (
    <AsyncSelect
      value={value != null ? String(value) : undefined}
      onChange={(next) => {
        const customerId = next ? Number(next) : null;
        void onChange(customerId).catch((error) => notify.error(error instanceof Error ? error.message : String(error)));
      }}
      options={options}
      onSearch={setQ}
      placeholder="عميل نقدي / اختر عميل"
      searchPlaceholder="ابحث عن عميل"
      emptyLabel="لا يوجد عملاء"
      isLoading={isFetching}
      disabled={disabled ?? false}
      className="min-h-11"
    />
  );
}
