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
import { formatPersonName } from '@/lib/personName';
import { cn } from '@/lib/utils';

import { suppliersPickerQueryOptions } from '../queries';

const NO_SUPPLIER = '__no_supplier__';

export type SupplierComboboxProps = {
  value: number | null;
  onChange: (supplierId: number | null) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  id?: string;
  allowClear?: boolean;
};

export function SupplierCombobox({
  value,
  onChange,
  disabled,
  className,
  label,
  id,
  allowClear = true,
}: SupplierComboboxProps) {
  const { t } = useTranslation('purchasing');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: suppliers = [], isLoading } = useQuery(suppliersPickerQueryOptions());

  const options = useMemo(
    () =>
      suppliers.map((s) => {
        const name = formatPersonName(s.first_name, s.father_name, s.family_name);
        return {
          id: s.id,
          name,
          searchBlob: `${s.id} ${s.code} ${name}`.toLowerCase(),
          label: name || s.code,
        };
      }),
    [suppliers],
  );

  const labelText = useMemo(() => {
    if (value == null || value === 0) {
      return allowClear ? '—' : '—';
    }
    return options.find((o) => o.id === value)?.label ?? `#${value}`;
  }, [allowClear, options, t, value]);

  return (
    <div className={cn('space-y-2', className)}>
      {label ? (
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
      ) : null}
      <Popover modal={false} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
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
            <CommandInput placeholder={t('suppliers.search_placeholder')} />
            <CommandList>
              <CommandEmpty>{isLoading ? '…' : t('suppliers.search_placeholder')}</CommandEmpty>
              <CommandGroup>
                {allowClear ? (
                  <CommandItem
                    value={NO_SUPPLIER}
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'me-2 size-4 shrink-0',
                        value == null || value === 0 ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    —
                  </CommandItem>
                ) : null}
                {options.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={o.searchBlob}
                    onSelect={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'me-2 size-4 shrink-0',
                        value === o.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
                      <span className="leading-tight">{o.label}</span>
                    </div>
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
