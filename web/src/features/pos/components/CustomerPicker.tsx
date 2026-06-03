import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AsyncSelect, type SelectOption } from '@/components/shared/form/Select';
import { Button } from '@/components/ui/button';
import { listCustomers } from '@/features/crm/api';
import { crmKeys } from '@/features/crm/queries';
import { formatPersonName } from '@/lib/personName';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/utils';

/** Sentinel value for cmdk; never overlaps numeric customer ids. */
const WALK_IN_OPTION_VALUE = '__pos_walk_in__';

export type CustomerPickerProps = {
  value?: number | null;
  disabled?: boolean;
  onChange: (customerId: number | null) => Promise<void>;
  className?: string;
};

export function CustomerPicker({ value, disabled, onChange, className }: CustomerPickerProps) {
  const { t } = useTranslation('pos');
  const [q, setQ] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: crmKeys.customersPosPickerSearch(q),
    queryFn: () => {
      const search = q.trim();
      return listCustomers({
        ...(search ? { search } : {}),
        pos_ready: true,
        limit: 20,
        offset: 0,
      });
    },
    enabled: !disabled,
  });

  const options: SelectOption[] = useMemo(() => {
    const walkIn: SelectOption = {
      value: WALK_IN_OPTION_VALUE,
      label: t('customer.walk_in'),
    };
    const rest = (data?.items ?? []).map((customer) => ({
      value: String(customer.id),
      label: `${formatPersonName(customer.first_name, customer.father_name, customer.family_name) || customer.phone} · ${customer.phone}`,
    }));
    return [walkIn, ...rest];
  }, [data, t]);

  const handleCustomerChange = (next: string) => {
    if (!next || next === WALK_IN_OPTION_VALUE) {
      void onChange(null).catch((error) =>
        notify.error(error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    const customerId = Number(next);
    if (!Number.isFinite(customerId)) {
      return;
    }
    void onChange(customerId).catch((error) =>
      notify.error(error instanceof Error ? error.message : String(error)),
    );
  };

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <div className="min-w-0 flex-1">
        <AsyncSelect
          value={value != null ? String(value) : undefined}
          onChange={handleCustomerChange}
          options={options}
          onSearch={setQ}
          placeholder={t('customer.picker_placeholder')}
          searchPlaceholder={t('customer.picker_search_placeholder')}
          emptyLabel={t('customer.picker_empty')}
          isLoading={isFetching}
          disabled={disabled ?? false}
          className="min-h-11"
        />
      </div>
      {value != null && !disabled ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label={t('customer.clear_from_cart')}
          onClick={() => {
            void onChange(null).catch((error) =>
              notify.error(error instanceof Error ? error.message : String(error)),
            );
          }}
        >
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
