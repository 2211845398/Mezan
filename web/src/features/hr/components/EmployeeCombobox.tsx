import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { employeeQueryOptions, employeesSearchQueryOptions } from '../queries';

const ALL_VALUE = '__all__';

export type EmployeeComboboxProps = {
  /** Employee profile id as string, or empty string for “all”. */
  value: string;
  onChange: (employeeId: string) => void;
  disabled?: boolean;
  className?: string;
  allowAll?: boolean;
};

function employeeOptionLabel(
  fullName: string | null | undefined,
  email: string | null | undefined,
  id: number,
): string {
  const name = (fullName ?? '').trim();
  if (name) return name;
  if (email) return email;
  return `#${id}`;
}

export function EmployeeCombobox({
  value,
  onChange,
  disabled,
  className,
  allowAll = true,
}: EmployeeComboboxProps) {
  const { t } = useTranslation('hr');
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const selectedId = useMemo(() => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [value]);

  const { data: searchResult, isLoading: searchLoading } = useQuery(
    employeesSearchQueryOptions({ q: debouncedQ, enabled: open }),
  );
  const employees = searchResult?.items ?? [];

  const { data: selectedEmployee, isLoading: selectedLoading } = useQuery({
    ...employeeQueryOptions(selectedId ?? 0),
    enabled: selectedId != null,
  });

  const options = useMemo(
    () =>
      employees.map((e) => {
        const label = employeeOptionLabel(e.user_full_name, e.user_email, e.id);
        return {
          id: e.id,
          label,
          searchBlob: `${e.id} ${label} ${e.user_email ?? ''}`.toLowerCase(),
        };
      }),
    [employees],
  );

  const labelText = useMemo(() => {
    if (!value) {
      return allowAll ? t('attendance.all') : '—';
    }
    const fromList = options.find((o) => String(o.id) === value);
    if (fromList) return fromList.label;
    if (selectedEmployee) {
      return employeeOptionLabel(
        selectedEmployee.user_full_name,
        selectedEmployee.user_email,
        selectedEmployee.id,
      );
    }
    return `#${value}`;
  }, [allowAll, options, selectedEmployee, t, value]);

  const loading = (searchLoading && open) || (selectedLoading && Boolean(value));

  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled ?? false}
          className={cn(
            'h-9 w-full justify-between py-2 font-normal rtl:flex-row-reverse',
            className ?? '',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-start">{loading ? '…' : labelText}</span>
          <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50 rtl:ms-0 rtl:me-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir={i18n.dir()}
        className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command dir={i18n.dir()} shouldFilter={false}>
          <CommandInput
            placeholder={t('attendance.employee_search_placeholder')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {searchLoading ? '…' : t('attendance.employee_search_empty')}
            </CommandEmpty>
            <CommandGroup>
              {allowAll ? (
                <CommandItem
                  value={ALL_VALUE}
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'me-2 size-4 shrink-0',
                      value === '' ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {t('attendance.all')}
                </CommandItem>
              ) : null}
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.searchBlob}
                  onSelect={() => {
                    onChange(String(o.id));
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'me-2 size-4 shrink-0',
                      value === String(o.id) ? 'opacity-100' : 'opacity-0',
                    )}
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
