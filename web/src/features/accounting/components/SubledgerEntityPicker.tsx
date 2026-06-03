import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { listCustomers } from '@/features/crm/api';
import { listEmployees } from '@/features/hr/api';
import { listSuppliers } from '@/features/purchasing/api';
import { formatPersonName } from '@/lib/personName';
import { cn } from '@/lib/utils';

import type { SubledgerKind } from '../api';

const NO_ENTITY = '__all_entities__';

type Props = {
  kind: SubledgerKind;
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
  /** First list item clears the filter (all entities). */
  allowClear?: boolean;
  clearLabel?: string;
};

export default function SubledgerEntityPicker({
  kind,
  value,
  onChange,
  className,
  allowClear,
  clearLabel,
}: Props) {
  const { t } = useTranslation('accounting');
  const [open, setOpen] = useState(false);

  const customersQ = useQuery({
    queryKey: ['subledger', 'customers'],
    queryFn: async () => {
      const res = await listCustomers({ limit: 100, offset: 0 });
      return res.items;
    },
    enabled: kind === 'customer',
  });
  const suppliersQ = useQuery({
    queryKey: ['subledger', 'suppliers'],
    queryFn: async () => {
      const res = await listSuppliers({ limit: 100, offset: 0 });
      return res.items;
    },
    enabled: kind === 'supplier',
  });
  const employeesQ = useQuery({
    queryKey: ['subledger', 'employees'],
    queryFn: async () => {
      const res = await listEmployees({ limit: 100, offset: 0 });
      return res.items;
    },
    enabled: kind === 'employee',
  });

  const options = useMemo(() => {
    if (kind === 'customer') {
      return (customersQ.data ?? []).map((c) => ({
        id: c.id,
        label:
          formatPersonName(c.first_name, c.father_name, c.family_name).trim() ||
          c.phone ||
          `#${c.id}`,
      }));
    }
    if (kind === 'supplier') {
      return (suppliersQ.data ?? []).map((s) => ({
        id: s.id,
        label: formatPersonName(s.first_name, s.father_name, s.family_name).trim() || s.code,
      }));
    }
    if (kind === 'employee') {
      return (employeesQ.data ?? []).map((e) => ({
        id: e.id,
        label: `#${e.id}`,
      }));
    }
    return [];
  }, [kind, customersQ.data, suppliersQ.data, employeesQ.data]);

  const isLoading =
    (kind === 'customer' && customersQ.isLoading) ||
    (kind === 'supplier' && suppliersQ.isLoading) ||
    (kind === 'employee' && employeesQ.isLoading);

  const selected = options.find((o) => o.id === value);
  const placeholder =
    kind === 'customer'
      ? t('manual.subledger.customer')
      : kind === 'supplier'
        ? t('manual.subledger.supplier')
        : t('manual.subledger.employee');

  const triggerLabel =
    isLoading
      ? '…'
      : selected?.label ??
        (allowClear && value == null ? (clearLabel ?? t('gl.all_entities')) : placeholder);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-9 w-full justify-between font-normal', className)}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('account_picker.search')} />
          <CommandList>
            <CommandEmpty>{isLoading ? '…' : t('account_picker.empty')}</CommandEmpty>
            <CommandGroup>
              {allowClear ? (
                <CommandItem
                  value={NO_ENTITY}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('me-2 size-4', value == null ? 'opacity-100' : 'opacity-0')}
                  />
                  {clearLabel ?? t('gl.all_entities')}
                </CommandItem>
              ) : null}
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('me-2 size-4', value === o.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
