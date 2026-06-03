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
import { cn } from '@/lib/utils';

import { chartAccountsQueryOptions } from '../queries';

type Props = {
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
};

export default function AccountPicker({ value, onChange, className }: Props) {
  const { t } = useTranslation('accounting');
  const [open, setOpen] = useState(false);
  const { data: accounts = [], isLoading } = useQuery(chartAccountsQueryOptions());

  const label = useMemo(() => {
    if (value == null) return t('account_picker.placeholder');
    const a = accounts.find((x) => x.id === value);
    return a ? `${a.code} — ${a.name}` : t('account_picker.placeholder');
  }, [accounts, t, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
        >
          {isLoading ? '…' : label}
          <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('account_picker.search')} />
          <CommandList>
            <CommandEmpty>{isLoading ? '…' : t('account_picker.empty')}</CommandEmpty>
            <CommandGroup>
              {accounts.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.code} ${a.name}`}
                  onSelect={() => {
                    onChange(a.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('me-2 size-4', value === a.id ? 'opacity-100' : 'opacity-0')} />
                  {a.code} — {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
