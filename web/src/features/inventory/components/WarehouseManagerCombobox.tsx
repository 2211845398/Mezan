import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { employeesQueryOptions } from '@/features/hr/queries';
import { formatPersonName } from '@/lib/personName';
import { cn } from '@/lib/utils';

const WAREHOUSE_MANAGER = 'WAREHOUSE_MANAGER';

type Props = {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  label?: string;
};

export function WarehouseManagerCombobox({ value, onChange, disabled, label }: Props) {
  const { t } = useTranslation('inventory');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: employees = [], isLoading } = useQuery(employeesQueryOptions());

  const options = useMemo(
    () =>
      employees
        .filter(
          (e) =>
            (e.user_status ?? '').toLowerCase() === 'active' &&
            (e.user_role_code ?? '').toUpperCase() === WAREHOUSE_MANAGER,
        )
        .map((e) => {
          const name =
            (e.user_full_name ?? '').trim() ||
            formatPersonName(e.user_first_name, e.user_father_name, e.user_family_name);
          return { id: e.id, name, searchBlob: `${e.id} ${name}`.toLowerCase() };
        })
        .filter((o) => o.name.length > 0),
    [employees],
  );

  const labelText = value.trim() || t('movement.stock_count.responsible_placeholder');

  return (
    <div className="space-y-2">
      {label ? <Label className="text-sm">{label}</Label> : null}
      <Popover modal={false} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading}
            className="h-9 w-full justify-between py-2 font-normal rtl:flex-row-reverse"
          >
            <span className="min-w-0 flex-1 truncate text-start">{isLoading ? '…' : labelText}</span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50 rtl:ms-0 rtl:me-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          dir={i18n.dir()}
          className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command dir={i18n.dir()}>
            <CommandInput placeholder={t('movement.stock_count.responsible_search')} />
            <CommandList>
              <CommandEmpty>{isLoading ? '…' : t('movement.stock_count.responsible_empty')}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={o.searchBlob}
                    onSelect={() => {
                      onChange(o.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'me-2 size-4 shrink-0',
                        value === o.name ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {o.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
