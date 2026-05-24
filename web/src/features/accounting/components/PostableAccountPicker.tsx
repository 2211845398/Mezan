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

import type { PostableChartAccountRead } from '../api';
import { postableAccountsQueryOptions } from '../queries';

type Props = {
  value: number | null;
  onChange: (account: PostableChartAccountRead | null) => void;
  className?: string;
};

function accountLabel(a: PostableChartAccountRead): string {
  if (a.parent_code) {
    return `${a.parent_code} › ${a.code} — ${a.name}`;
  }
  return `${a.code} — ${a.name}`;
}

export default function PostableAccountPicker({ value, onChange, className }: Props) {
  const { t } = useTranslation('accounting');
  const [open, setOpen] = useState(false);
  const { data: accounts = [], isLoading } = useQuery(postableAccountsQueryOptions());

  const selected = useMemo(
    () => accounts.find((x) => x.id === value) ?? null,
    [accounts, value],
  );

  const label = selected ? accountLabel(selected) : t('account_picker.placeholder');

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
          <span className="truncate">{isLoading ? '…' : label}</span>
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
                  value={`${a.code} ${a.name} ${a.parent_name ?? ''}`}
                  onSelect={() => {
                    onChange(a);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('me-2 size-4', value === a.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {accountLabel(a)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
